/**
 * PURPOSE    Connect the Lightroom-style Photo editor to the shared application.
 * KIND       SHELL assembly PHOTO-APP; decoding, worker routing, preview display and browser I/O only.
 * CONTRACT   IN: S07 file ports, browser Worker/Canvas/createImageBitmap. OUT: WorkspaceAdapter for gsnv-photo.
 *            RAW files decode through LibRaw-WASM to 16-bit linear sRGB; other formats through the browser.
 *            Slider drags preview without history; each release, preset, Auto, crop or geometry change commits one entry.
 *            RAISES: invalid project content from decode; operational failures show in the hint.
 * GUARANTEES The original file is never modified; previews and exports use the same develop pipeline.
 * TUNING     PREVIEW_CAP, DRAFT_FACTOR and EXPORT_SIZES below.
 * DECISIONS  D1: Preview at screen resolution (draft at half size while dragging) in a worker, latest
 *            request wins. Alternative: full-resolution live rendering; rejected as far too slow in JS.
 * LIMITS     One photo per document; crop overlay works in the uncropped, straightened frame.
 * TESTBENCH  src/photo/photo-workspace.browser.spec.ts -- run with: npm run test:browser -- src/photo/photo-workspace.browser.spec.ts
 */
import LibRaw from 'libraw-wasm';
import type { WorkspaceAdapter } from '../app/app-shell.ts';
import type { View2D } from '../shared/view-transform.ts';
import { fileAccess, type FilePorts } from '../shared/file-access.ts';
import { photoContent, RAW_EXTENSIONS, DISPLAY_TYPES, ASSET_ID, type PhotoContent } from './photo-content.ts';
import { defaultSettings, mergeSettings, PRESETS, type DevelopSettings } from './develop-settings.ts';
import { photoControls, ASPECTS } from './photo-controls.ts';
import type { PhotoWorkerReply, PhotoWorkerRequest } from './photo-develop.worker.ts';
import './photo-workspace.css';

type Snapshot = Parameters<ReturnType<WorkspaceAdapter['mount']>['render']>[0];
type Distribute<T> = T extends unknown ? Omit<T, 'id'> : never;
const PREVIEW_CAP = 2400, DRAFT_FACTOR = 0.5;
const EXPORT_SIZES = [['full', 'Full size'], ['4096', '4096 px long edge'], ['2560', '2560 px long edge'], ['2048', '2048 px long edge'], ['1080', '1080 px long edge']] as const;
const ACCEPT = { 'image/*': [...RAW_EXTENSIONS, ...Object.values(DISPLAY_TYPES).flat()] };
const GEOMETRY = ['crop', 'straighten', 'quarterTurns', 'flip'] as const;
let settingsClipboard: Partial<DevelopSettings> | null = null;
const basename = (name: string) => name.replace(/\.[^.]+$/, '') || 'Untitled photo';

export function createPhotoWorkspace(files: FilePorts): WorkspaceAdapter {
  return {
    decode(packageValue) {
      const p = packageValue.project, asset = packageValue.assets[0];
      if (p.format !== 'gsnv-photo' || packageValue.assets.length !== 1 || asset?.id !== ASSET_ID) throw new Error('This Photo build opens gsnv-photo projects with one original file.');
      return { id: p.id, title: p.title, format: p.format, version: p.version, value: photoContent({ operation: 'decode', content: p.content, bytes: asset.bytes }) };
    },
    encode(document) {
      const encoded = photoContent({ operation: 'encode', value: document.value as PhotoContent });
      return { project: { format: 'gsnv-photo', version: 1, id: document.id, title: document.title, content: encoded.content }, assets: [{ id: ASSET_ID, mime: encoded.content.mime, bytes: encoded.bytes }] };
    },
    mount(host) {
      const document = host.root.ownerDocument, window = document.defaultView!;
      const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') => { const n = document.createElement(tag); n.className = className; if (text) n.textContent = text; return n; };
      const stage = make('div', 'photo-stage'), surface = make('div', 'photo-surface'), canvas = make('canvas', 'photo-canvas'), crop = make('div', 'photo-crop');
      const empty = make('div', 'photo-empty'), hint = make('div', 'photo-hint'), badge = make('div', 'photo-badge', 'Before'), panel = document.createElement('div');
      const importButton = make('button', 'photo-import', 'Import photo…'); importButton.type = 'button';
      empty.append(make('h2', '', 'Develop a photo'), make('p', '', 'Open a camera RAW file (DNG, CR2, CR3, NEF, ARW, RAF, ORF, RW2 …) or a JPEG, PNG, WebP or HEIC image. Drop a file here or choose one.'), importButton);
      for (const handle of ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w']) { const h = make('span', 'photo-crop-handle'); h.dataset.handle = handle; crop.append(h); }
      crop.append(make('span', 'photo-crop-grid'));
      stage.tabIndex = -1; canvas.setAttribute('aria-label', 'Photo preview'); surface.append(canvas, crop); stage.append(surface, empty, badge); host.root.append(stage, hint);
      let current: Snapshot, content: PhotoContent | null = null, loadedSource: PhotoContent['source'] | null = null, view: View2D = { zoom: 1, pan: { x: 0, y: 0 } };
      let preview: DevelopSettings | null = null, before = false, cropMode = false, aspect = 'Free', draftCrop: DevelopSettings['crop'] | null = null;
      let message = '', busy = '', disposed = false, histogram: Uint32Array | null = null, frame = { width: 0, height: 0 }, sequence = 0, loadToken = 0;
      let inflight = false, pending: { draft: boolean } | null = null, ready = false;
      const waiting = new Map<number, (reply: PhotoWorkerReply) => void>();
      const worker = new Worker(new URL('./photo-develop.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = event => { const reply = event.data as PhotoWorkerReply, resolve = waiting.get(reply.id); waiting.delete(reply.id); resolve?.(reply); };
      const call = (request: Distribute<PhotoWorkerRequest>, transfer: Transferable[] = []) => new Promise<PhotoWorkerReply>(resolve => { const id = ++sequence; waiting.set(id, resolve); worker.postMessage({ ...request, id }, transfer); });
      const controls = photoControls({ root: panel,
        onPreview(change) { if (!content) return; preview = mergeSettings(preview ?? content.settings, change); schedule(true); },
        onCommit(change, label) { preview = null; commit(change, label); },
        onAction: action });

      const settings = () => preview ?? content?.settings ?? defaultSettings();
      const shown = () => { const s = settings(); return before ? mergeSettings(defaultSettings(), { ...Object.fromEntries(GEOMETRY.map(k => [k, s[k]])), sharpenAmount: 0, noiseColor: 0 }) : s; };
      function setBusy(text: string) { busy = text; stage.setAttribute('aria-busy', String(!!text)); refresh(); host.invalidate(); }
      function refresh() {
        if (disposed) return;
        empty.hidden = !!current; surface.hidden = !current || !ready; badge.hidden = !before; stage.dataset.crop = String(cropMode);
        hint.textContent = busy || message || (cropMode ? 'Drag the frame or its handles · Enter applies the crop · Esc cancels.' : current ? 'Drag sliders to adjust · double-click a label to reset · \\ shows before/after · R crops.' : 'Import a photo to start.');
        hint.hidden = !current && !busy;
        controls.update({ settings: draftCrop ? { ...settings(), crop: draftCrop } : settings(), histogram, enabled: !!current && ready, cropMode, before, aspect });
        layout();
      }
      function layout() {
        if (!frame.width) return;
        const w = stage.clientWidth || 800, h = stage.clientHeight || 600, margin = 28, fit = Math.min((w - 2 * margin) / frame.width, (h - 2 * margin) / frame.height);
        const cw = frame.width * fit, ch = frame.height * fit, x = (w - cw) / 2, y = (h - ch) / 2;
        Object.assign(surface.style, { left: `${x}px`, top: `${y}px`, width: `${cw}px`, height: `${ch}px`, transform: `translate(${view.pan.x}px,${view.pan.y}px) scale(${view.zoom})` });
        const c = draftCrop ?? settings().crop; crop.hidden = !cropMode;
        if (cropMode) Object.assign(crop.style, { left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.width * 100}%`, height: `${c.height * 100}%` });
      }
      function maxEdge(draft: boolean) { const dpr = Math.min(2, window.devicePixelRatio || 1), edge = Math.min(PREVIEW_CAP, Math.max(stage.clientWidth || 800, stage.clientHeight || 600) * dpr); return Math.round(draft ? edge * DRAFT_FACTOR : edge); }
      function schedule(draft = false) {
        if (!ready || disposed) return;
        if (inflight) { pending = { draft: (pending?.draft ?? true) && draft }; return; }
        inflight = true; stage.dataset.rendering = 'true';
        void call({ type: 'render', settings: shown(), maxEdge: maxEdge(draft), ignoreCrop: cropMode }).then(reply => {
          inflight = false; if (disposed) return;
          if (reply.ok && reply.type === 'rendered') {
            canvas.width = reply.width; canvas.height = reply.height; frame = { width: reply.width, height: reply.height };
            canvas.getContext('2d')?.putImageData(new ImageData(reply.rgba as Uint8ClampedArray<ArrayBuffer>, reply.width, reply.height), 0, 0);
            histogram = reply.histogram; refresh();
          } else if (!reply.ok) { message = reply.message; refresh(); }
          if (pending) { const next = pending; pending = null; schedule(next.draft); } else if (draft) schedule(false); else delete stage.dataset.rendering;
        });
      }
      async function load(source: PhotoContent['source']) {
        const token = ++loadToken; ready = false; frame = { width: 0, height: 0 }; histogram = null; setBusy(`Decoding ${source.name}…`);
        try {
          let reply: PhotoWorkerReply;
          if (source.kind === 'raw') {
            const raw = new LibRaw();
            try {
              await raw.open(source.bytes.slice(), { outputBps: 16, gamm: [1, 1], noAutoBright: true, useCameraWb: true, outputColor: 1, userQual: 3 });
              const image = await raw.imageData(); if (!image || image.colors !== 3) throw new Error('LibRaw returned no RGB image.');
              const data = image.data instanceof Uint16Array ? image.data : Uint16Array.from(image.data, v => v * 257);
              if (token !== loadToken || disposed) return;
              reply = await call({ type: 'load', kind: 'raw', width: image.width, height: image.height, data }, [data.buffer]);
            } finally { raw.dispose(); }
          } else {
            const bitmap = await createImageBitmap(new Blob([source.bytes.slice()], { type: source.mime }));
            if (token !== loadToken || disposed) { bitmap.close(); return; }
            reply = await call({ type: 'loadBitmap', bitmap }, [bitmap]);
          }
          if (token !== loadToken || disposed) return;
          if (!reply.ok) throw new Error(reply.message);
          loadedSource = source; ready = true; message = ''; setBusy(''); schedule(false);
        } catch (cause) { if (token === loadToken) { message = `This photo could not be opened: ${cause instanceof Error ? cause.message : String(cause)}`; setBusy(''); } }
      }
      function commit(change: Partial<DevelopSettings>, label: string) {
        if (!content || !current) return;
        try { host.commit({ ...current, value: { source: content.source, settings: mergeSettings(content.settings, change) } }, label, current.identity); }
        catch (cause) { message = cause instanceof Error ? cause.message : String(cause); refresh(); }
      }
      async function importPhoto(file?: File) {
        let name: string, mime: string, bytes: Uint8Array;
        if (file) { name = file.name; mime = file.type; bytes = new Uint8Array(await file.arrayBuffer()); }
        else {
          const result = await fileAccess({ op: 'open', accept: ACCEPT }, files);
          if (disposed || 'cancelled' in result) return;
          if (!result.ok) { message = `${result.error.code}: ${result.error.message}`; refresh(); return; }
          name = result.value.name; mime = ''; const parts = result.value.bytes, total = parts.reduce((s, p) => s + p.length, 0);
          bytes = new Uint8Array(total); let offset = 0; for (const p of parts) { bytes.set(p, offset); offset += p.length; }
        }
        const extension = name.slice(name.lastIndexOf('.')).toLowerCase();
        mime ||= Object.entries(DISPLAY_TYPES).find(([, ext]) => ext.includes(extension))?.[0] ?? 'application/octet-stream';
        try { await host.open({ id: crypto.randomUUID(), title: basename(name), format: 'gsnv-photo', version: 1, value: photoContent({ operation: 'new', name, mime, bytes }) }); }
        catch (cause) { message = cause instanceof Error ? cause.message : String(cause); refresh(); }
      }
      function exportPhoto() {
        if (!content || !current) return;
        host.dialog({ title: 'Export photo', fields: [
          { key: 'format', label: 'Format', type: 'select', choices: [{ value: 'image/jpeg', label: 'JPEG' }, { value: 'image/png', label: 'PNG' }] },
          { key: 'quality', label: 'JPEG quality', type: 'number', min: 10, max: 100, step: 1 },
          { key: 'size', label: 'Size', type: 'select', choices: EXPORT_SIZES.map(([value, label]) => ({ value, label })) }],
        initial: { format: 'image/jpeg', quality: 92, size: 'full' },
        validate(values) { const q = Number(values.quality); return Number.isInteger(q) && q >= 10 && q <= 100 ? { ok: true, value: values } : { ok: false, error: { code: 'photo.quality', message: 'Quality is a whole number from 10 to 100.' } }; },
        preview() {}, cancel() {},
        commit(value) {
          const v = value as { format: 'image/jpeg' | 'image/png'; quality: number; size: string }, title = current!.title.trim() || 'photo';
          setBusy('Exporting at full quality…');
          void call({ type: 'export', settings: content!.settings, maxEdge: v.size === 'full' ? null : Number(v.size), mime: v.format, quality: v.quality / 100 }).then(async reply => {
            setBusy('');
            if (!reply.ok || reply.type !== 'exported') { message = reply.ok ? 'Export failed.' : reply.message; refresh(); return; }
            const saved = await fileAccess({ op: 'save', name: `${title}.${v.format === 'image/png' ? 'png' : 'jpg'}`, mime: v.format, bytes: reply.bytes }, files);
            if ('cancelled' in saved) return; message = saved.ok ? `Exported ${saved.value.name} (${reply.width} × ${reply.height}).` : `${saved.error.code}: ${saved.error.message}`; refresh();
          });
        },
      });
    }
    function constrain(c: DevelopSettings['crop'], anchor: string): DevelopSettings['crop'] {
      const ratio = ASPECTS[aspect] ?? null; let { x, y, width, height } = c;
      width = Math.min(1, Math.max(0.02, width)); height = Math.min(1, Math.max(0.02, height));
      if (ratio !== null && frame.width) {
        const target = (ratio === 0 ? frame.width / frame.height : ratio) * frame.height / frame.width;
        if (anchor === 'n' || anchor === 's') width = height * target; else height = width / target;
        if (width > 1) { width = 1; height = width / target; } if (height > 1) { height = 1; width = height * target; }
      }
      x = Math.min(1 - width, Math.max(0, x)); y = Math.min(1 - height, Math.max(0, y)); return { x, y, width, height };
    }
    function setCropMode(on: boolean, apply: boolean) {
      if (on === cropMode) return;
      if (!on && apply && draftCrop && content) { const next = draftCrop; draftCrop = null; cropMode = false; commit({ crop: next }, 'Crop'); }
      draftCrop = on ? { ...settings().crop } : null; cropMode = on; refresh(); schedule(false); host.invalidate();
    }
    function action(id: string) {
      if (!content) { if (id === 'photo.import') void importPhoto(); return; }
      const s = content.settings, keep = Object.fromEntries(GEOMETRY.map(k => [k, s[k]])) as Partial<DevelopSettings>;
      if (id === 'photo.import') void importPhoto();
      else if (id === 'photo.export') exportPhoto();
      else if (id === 'photo.auto') { setBusy('Analysing…'); void call({ type: 'auto', settings: s }).then(reply => { setBusy(''); if (reply.ok && reply.type === 'auto') commit(reply.change, 'Auto'); }); }
      else if (id === 'photo.reset') commit({ ...defaultSettings(), ...keep }, 'Reset all');
      else if (id.startsWith('preset.')) { const name = id.slice(7); commit({ ...defaultSettings(), temperature: s.temperature, tint: s.tint, exposure: s.exposure, ...keep, ...PRESETS[name] }, `Preset: ${name}`); }
      else if (id === 'photo.beforeAfter') { before = !before; refresh(); schedule(false); }
      else if (id === 'photo.crop') setCropMode(!cropMode, true);
      else if (id === 'photo.resetCrop') { draftCrop = cropMode ? { x: 0, y: 0, width: 1, height: 1 } : null; if (!cropMode) commit({ crop: { x: 0, y: 0, width: 1, height: 1 }, straighten: 0 }, 'Reset crop'); refresh(); }
      else if (id === 'photo.rotateLeft' || id === 'photo.rotateRight') commit({ quarterTurns: ((s.quarterTurns + (id === 'photo.rotateRight' ? 1 : 3)) % 4) as DevelopSettings['quarterTurns'], crop: { x: 0, y: 0, width: 1, height: 1 } }, id === 'photo.rotateRight' ? 'Rotate right' : 'Rotate left');
      else if (id === 'photo.flip') commit({ flip: !s.flip }, 'Flip');
      else if (id.startsWith('aspect.')) { aspect = id.slice(7); if (cropMode && draftCrop) draftCrop = constrain(draftCrop, 'se'); refresh(); }
      else if (id === 'edit.copy') { settingsClipboard = Object.fromEntries(Object.entries(s).filter(([k]) => !(GEOMETRY as readonly string[]).includes(k))) as Partial<DevelopSettings>; message = 'Develop settings copied.'; refresh(); }
      else if (id === 'edit.paste') { if (settingsClipboard) commit(settingsClipboard, 'Paste settings'); else { message = 'Copy settings from another photo first.'; refresh(); } }
      else if (id === 'tool.cancel') { if (cropMode) setCropMode(false, false); else if (before) action('photo.beforeAfter'); }
      else if (id === 'tool.confirm' && cropMode) setCropMode(false, true);
      host.invalidate();
    }
    // Crop dragging works in the surface's own coordinate space, so it follows zoom and pan.
    let dragging: { handle: string; start: { x: number; y: number }; crop: DevelopSettings['crop'] } | null = null;
    const local = (event: PointerEvent) => { const r = surface.getBoundingClientRect(); return { x: (event.clientX - r.left) / r.width, y: (event.clientY - r.top) / r.height }; };
    const cropDown = (event: PointerEvent) => {
      if (!cropMode || !draftCrop || event.button !== 0) return;
      const target = event.target as HTMLElement; if (!crop.contains(target)) return;
      event.preventDefault(); event.stopPropagation(); crop.setPointerCapture(event.pointerId);
      dragging = { handle: target.dataset.handle ?? 'move', start: local(event), crop: { ...draftCrop } };
    };
    const cropMove = (event: PointerEvent) => {
      if (!dragging) return; event.preventDefault(); event.stopPropagation();
      const p = local(event), dx = p.x - dragging.start.x, dy = p.y - dragging.start.y, c = { ...dragging.crop }, h = dragging.handle;
      if (h === 'move') { c.x += dx; c.y += dy; }
      else {
        if (h.includes('w')) { c.x += dx; c.width -= dx; } if (h.includes('e')) c.width += dx;
        if (h.includes('n')) { c.y += dy; c.height -= dy; } if (h.includes('s')) c.height += dy;
        if (c.x < 0) { c.width += c.x; c.x = 0; } if (c.y < 0) { c.height += c.y; c.y = 0; }
      }
      draftCrop = constrain(c, h); refresh();
    };
    const cropUp = (event: PointerEvent) => { if (dragging) { event.stopPropagation(); dragging = null; } };
    crop.addEventListener('pointerdown', cropDown); crop.addEventListener('pointermove', cropMove); crop.addEventListener('pointerup', cropUp); crop.addEventListener('pointercancel', cropUp);
    const drop = (event: DragEvent) => { event.preventDefault(); stage.classList.remove('photo-dropping'); const file = event.dataTransfer?.files[0]; if (file) void importPhoto(file); };
    const over = (event: DragEvent) => { event.preventDefault(); stage.classList.add('photo-dropping'); };
    const leave = () => stage.classList.remove('photo-dropping');
    stage.addEventListener('drop', drop); stage.addEventListener('dragover', over); stage.addEventListener('dragleave', leave);
    importButton.addEventListener('click', () => { void importPhoto(); });
    const Resize = window.ResizeObserver, observer = Resize ? new Resize(() => { layout(); }) : null; observer?.observe(stage);
    return {
      render(snapshot, nextView) {
        const changed = snapshot?.identity !== current?.identity; current = snapshot; view = nextView;
        if (changed) {
          content = snapshot ? snapshot.value as PhotoContent : null; preview = null;
          if (cropMode && content) draftCrop = { ...content.settings.crop };
          if (!content) { ready = false; loadedSource = null; frame = { width: 0, height: 0 }; }
          else if (content.source !== loadedSource) { cropMode = false; draftCrop = null; before = false; void load(content.source); }
          else schedule(false);
        }
        refresh();
      },
      model() {
        const enabled = !!current && ready, item = (id: string, label: string, icon?: string, shortcut = '', toolbar = false, on = enabled) => ({ id, label, shortcut, enabled: on, ...(icon ? { icon } : {}), ...(toolbar ? { toolbar } : {}) });
        return { menus: [{ id: 'photo', label: 'Photo', items: [item('photo.import', 'Import photo…', 'open', '', true, !busy), item('photo.export', 'Export…', 'export', '', true), item('photo.auto', 'Auto tone', 'fit', '', true),
          item('photo.beforeAfter', before ? 'Show after' : 'Show before', 'history', '\\', true), item('photo.crop', cropMode ? 'Apply crop' : 'Crop & straighten', 'crop', 'R', true), item('edit.copy', 'Copy settings', 'copy', 'Ctrl+C'), item('edit.paste', 'Paste settings', 'paste', 'Ctrl+V', false, enabled && !!settingsClipboard),
          item('photo.rotateLeft', 'Rotate left', 'rotate'), item('photo.rotateRight', 'Rotate right', 'rotate'), item('photo.reset', 'Reset all edits', 'undo')] }],
          tools: [], panels: [{ id: 'photo-develop', title: 'Develop', content: panel }] };
      },
      context: () => ({ viewRole: 'preview2d', activeTool: cropMode ? 'crop' : 'develop', status: hint.textContent ?? '' }),
      command(id) { action(id); },
      gesture() {},
      dispose() { if (disposed) return; disposed = true; observer?.disconnect(); worker.terminate(); controls.dispose(); stage.removeEventListener('drop', drop); stage.removeEventListener('dragover', over); stage.removeEventListener('dragleave', leave); host.root.replaceChildren(); },
    };
    },
  };
}
