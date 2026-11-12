/**
 * PURPOSE    Connect the paint-style Image editor to the shared application.
 * KIND       SHELL assembly IMAGE-APP; routing, lifecycle, canvas display and browser I/O only.
 * CONTRACT   IN: S07 file ports and browser DOM/Canvas. OUT: production WorkspaceAdapter for gsnv-image.
 *            Pixel decisions belong to raster-ops; gestures to image-tool-input; snapshots to image-content.
 *            Each completed stroke, shape, fill, text, move, paste or image command commits exactly one
 *            history entry; drags in progress and floating selections stay outside history.
 *            RAISES: invalid project content errors from decode; operational failures show in the hint.
 * GUARANTEES Saved files contain the exact committed pixels; undo/redo/open resynchronize the canvas.
 * TUNING     NEW_SIZE, MARGIN and text defaults below; colours and sizes in image-palette.
 * DECISIONS  D1: One working raster mutated in place during a drag, committed as shared tiles at the end.
 *            Alternative: commit per sample; rejected because history would hold every mouse move.
 *            D2: Lifted selections float until dropped (click outside, Enter, tool change), as in classic
 *            paint programs. Esc cancels the float. Revisit if: layers are introduced.
 * LIMITS     Single raster layer, rectangular selection, opaque colour editing. Image import and PNG
 *            export use the browser codecs; system clipboard access depends on browser permission.
 * TESTBENCH  src/image/image-workspace.browser.spec.ts -- run with: npm run test:browser -- src/image/image-workspace.browser.spec.ts
 */
import type { WorkspaceAdapter, AppDocument } from '../app/app-shell.ts';
import type { View2D } from '../shared/view-transform.ts';
import { fileAccess, type FilePorts } from '../shared/file-access.ts';
import { imageContent, ASSET_ID, type ImageContent } from './image-content.ts';
import { paintRaster, transformRaster, clip, createRaster, MAX_PIXELS, type Raster, type RGBA, type Rect, type TransformOp } from './raster-ops.ts';
import { imageToolInput, IMAGE_TOOLS, type ImageTool, type ImageToolState } from './image-tool-input.ts';
import { imagePalette, type ShapeStyle } from './image-palette.ts';
import './image-workspace.css';

type Snapshot = Parameters<ReturnType<WorkspaceAdapter['mount']>['render']>[0];
type Floating = { raster: Raster; x: number; y: number; label: string };
const NEW_SIZE = { width: 800, height: 600 };
const MARGIN = 24;
const BLACK: RGBA = [0, 0, 0, 255], WHITE: RGBA = [255, 255, 255, 255];
const IMAGE_TYPES = { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/gif': ['.gif'], 'image/webp': ['.webp'], 'image/bmp': ['.bmp'] };
const TOOLS: Record<ImageTool, { label: string; icon: string; key: string; hint: string }> = {
  select: { label: 'Select', icon: 'select', key: 'S', hint: 'Drag to select · drag inside the selection to move it · Enter places it · Delete clears.' },
  pencil: { label: 'Pencil', icon: 'pencil', key: 'P', hint: 'Draw 1-pixel lines · left: primary colour · right: secondary colour.' },
  brush: { label: 'Brush', icon: 'brush', key: 'B', hint: 'Paint with a round brush of the chosen size · right button uses the secondary colour.' },
  eraser: { label: 'Eraser', icon: 'eraser', key: 'E', hint: 'Erase to the secondary colour with a square tip of the chosen size.' },
  fill: { label: 'Fill', icon: 'fill', key: 'G', hint: 'Click to fill a connected area of one colour.' },
  picker: { label: 'Pick colour', icon: 'picker', key: 'I', hint: 'Click to pick the primary colour · right-click picks the secondary colour.' },
  line: { label: 'Line', icon: 'line', key: 'L', hint: 'Drag to draw a line · Shift snaps to 45°.' },
  rectangle: { label: 'Rectangle', icon: 'rectangle', key: 'R', hint: 'Drag to draw a rectangle · Shift draws a square · style is in the Colours panel.' },
  ellipse: { label: 'Ellipse', icon: 'ellipse', key: 'O', hint: 'Drag to draw an ellipse · Shift draws a circle.' },
  text: { label: 'Text', icon: 'text', key: 'T', hint: 'Click where the text should start.' },
};

const copyRaster = (r: Raster): Raster => ({ width: r.width, height: r.height, data: new Uint8ClampedArray(r.data) });
const extract = (r: Raster, rect: Rect) => transformRaster(r, { kind: 'crop', rect });
const basename = (name: string) => name.replace(/\.[^.]+$/, '') || 'Untitled image';

export function createImageWorkspace(files: FilePorts): WorkspaceAdapter {
  return {
    create: () => ({ id: crypto.randomUUID(), title: 'Untitled image', format: 'gsnv-image', version: 1, value: imageContent({ operation: 'new', ...NEW_SIZE, fill: WHITE }) }),
    decode(packageValue) {
      const p = packageValue.project, asset = packageValue.assets[0];
      if (p.format !== 'gsnv-image' || packageValue.assets.length !== 1 || asset?.id !== ASSET_ID) throw new Error('This Image build opens single-layer gsnv-image projects.');
      return { id: p.id, title: p.title, format: p.format, version: p.version, value: imageContent({ operation: 'decode', content: p.content, bytes: asset.bytes }) };
    },
    encode(document) {
      const encoded = imageContent({ operation: 'encode', value: document.value as ImageContent });
      return { project: { format: 'gsnv-image', version: 1, id: document.id, title: document.title, content: encoded.content }, assets: [{ id: ASSET_ID, mime: 'application/octet-stream', bytes: encoded.bytes }] };
    },
    mount(host) {
      const document = host.root.ownerDocument, window = document.defaultView!;
      const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string) => { const node = document.createElement(tag); node.className = className; return node; };
      const stage = make('div', 'image-stage'), surface = make('div', 'image-surface'), canvas = make('canvas', 'image-canvas'), float = make('canvas', 'image-floating');
      const marquee = make('div', 'image-marquee'), hint = make('div', 'image-tool-hint'), notice = make('div', 'image-empty'), panel = document.createElement('div');
      stage.tabIndex = -1; canvas.setAttribute('aria-label', 'Image canvas'); notice.textContent = 'Choose New (Ctrl+N) to start an image, or Open (Ctrl+O) a .gsnv-image project.';
      surface.append(canvas, float); stage.append(surface, marquee, notice); host.root.append(stage, hint);
      const context = canvas.getContext('2d'), floatContext = float.getContext('2d');
      let current: Snapshot, source: ImageContent | null = null, raster: Raster | null = null, pixels: ImageData | null = null, view: View2D = { zoom: 1, pan: { x: 0, y: 0 } };
      let tool: ImageToolState = { tool: 'pencil', drag: null }, previousTool: ImageTool = 'pencil', primary = BLACK, secondary = WHITE, size = 3, style: ShapeStyle = 'outline';
      let selection: Rect | null = null, floating: Floating | null = null, liftOrigin: { x: number; y: number } | null = null, preview: Rect | null = null;
      let base: Uint8ClampedArray | null = null, lastDirty: Rect | null = null, strokeDirty = false, clipboard: Raster | null = null;
      let scale = 1, offset = { x: 0, y: 0 }, panning: { x: number; y: number } | null = null, cursor: [number, number] | null = null, message = '', disposed = false;
      const palette = imagePalette({ root: panel, onChange(change) {
        if (change.kind === 'primary') primary = change.color; else if (change.kind === 'secondary') secondary = change.color;
        else if (change.kind === 'swap') [primary, secondary] = [secondary, primary]; else if (change.kind === 'size') size = change.size; else if (change.kind === 'style') style = change.style;
        refresh();
      } });

      const origin = () => { const w = stage.clientWidth || 800, h = stage.clientHeight || 600, iw = (raster?.width ?? 0) * scale, ih = (raster?.height ?? 0) * scale; return { x: Math.max(MARGIN, (w - iw) / 2) + offset.x, y: Math.max(MARGIN, (h - ih) / 2) + offset.y }; };
      const toDocument = (p: { x: number; y: number }): [number, number] => { const o = origin(); return [((p.x - view.pan.x) / view.zoom - o.x) / scale, ((p.y - view.pan.y) / view.zoom - o.y) / scale]; };
      const toScreen = (x: number, y: number) => { const o = origin(); return { x: view.pan.x + view.zoom * (o.x + x * scale), y: view.pan.y + view.zoom * (o.y + y * scale) }; };
      const union = (a: Rect | null, b: Rect | null): Rect | null => !a ? b : !b ? a : { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x), height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y) };
      const fail = (cause: unknown) => { message = cause instanceof Error ? cause.message : String(cause); refresh(); };

      function paint(rect: Rect | null = null) {
        if (!raster || !context || !pixels) return;
        const r = rect ? clip(rect, raster) : { x: 0, y: 0, width: raster.width, height: raster.height };
        if (r.width && r.height) context.putImageData(pixels, 0, 0, r.x, r.y, r.width, r.height);
      }
      function load(next: Raster) {
        raster = next; canvas.width = next.width; canvas.height = next.height;
        pixels = new ImageData(next.data as Uint8ClampedArray<ArrayBuffer>, next.width, next.height); paint();
      }
      function layout() {
        const o = origin(), z = view.zoom * scale;
        surface.style.transform = `translate(${view.pan.x + view.zoom * o.x}px,${view.pan.y + view.zoom * o.y}px) scale(${z})`;
        surface.style.width = `${raster?.width ?? 0}px`; surface.style.height = `${raster?.height ?? 0}px`; surface.dataset.zoom = z >= 2 ? 'pixels' : 'smooth';
        if (floating && floatContext) { float.hidden = false; float.style.left = `${floating.x}px`; float.style.top = `${floating.y}px`; }
        else float.hidden = true;
        const shown = floating ? { x: floating.x, y: floating.y, width: floating.raster.width, height: floating.raster.height } : preview ?? selection;
        marquee.hidden = !shown;
        if (shown) { const a = toScreen(shown.x, shown.y), b = toScreen(shown.x + shown.width, shown.y + shown.height); Object.assign(marquee.style, { left: `${a.x}px`, top: `${a.y}px`, width: `${b.x - a.x}px`, height: `${b.y - a.y}px` }); }
        marquee.dataset.floating = String(!!floating);
      }
      function refresh() {
        if (disposed) return;
        notice.hidden = !!current; surface.hidden = !current; layout(); stage.dataset.tool = tool.tool;
        hint.textContent = message || (current ? TOOLS[tool.tool].hint : 'New (Ctrl+N) starts an image.');
        const parts = raster ? [`${raster.width} × ${raster.height} px`, `zoom ${Math.round(view.zoom * scale * 100)}%`] : [];
        if (cursor && raster) parts.push(`cursor ${Math.floor(cursor[0])}, ${Math.floor(cursor[1])}`);
        const s = floating ? floating.raster : selection; if (s) parts.push(`selection ${s.width} × ${s.height}`);
        palette.update({ primary, secondary, size, style, info: parts.join(' · '), enabled: !!current });
        if (current && document.activeElement === document.body && !document.querySelector('dialog[open]')) stage.focus();
      }
      function commit(next: Raster, label: string, title?: string) {
        if (!current) return;
        try {
          const value = imageContent({ operation: 'update', previous: source, raster: next });
          source = value; message = ''; host.commit({ ...current, ...(title ? { title } : {}), value }, label, current.identity);
        } catch (cause) { fail(cause); }
      }
      function resync() { if (!current) return; source = current.value as ImageContent; load(imageContent({ operation: 'raster', value: source })); }
      function discardFloat() { if (floating && raster && source) { floating = null; liftOrigin = null; resync(); } floating = null; liftOrigin = null; }
      function drop() {
        if (!floating || !raster) return;
        const f = floating; floating = null; liftOrigin = null;
        paintRaster(raster, { kind: 'blit', source: f.raster, x: f.x, y: f.y, mode: 'over' });
        selection = clip({ x: f.x, y: f.y, width: f.raster.width, height: f.raster.height }, raster); if (!selection.width || !selection.height) selection = null;
        paint(); commit(copyRaster(raster), f.label);
      }
      function lift() {
        if (!raster || !selection || floating) return;
        floating = { raster: extract(raster, selection), x: selection.x, y: selection.y, label: 'Move selection' }; liftOrigin = { x: selection.x, y: selection.y };
        paintRaster(raster, { kind: 'clear', rect: selection, color: secondary }); paint(selection); showFloat();
      }
      function showFloat() {
        if (!floating || !floatContext) return;
        float.width = floating.raster.width; float.height = floating.raster.height;
        floatContext.putImageData(new ImageData(floating.raster.data as Uint8ClampedArray<ArrayBuffer>, floating.raster.width, floating.raster.height), 0, 0);
      }
      const colors = (button: 0 | 2) => button === 0 ? [primary, secondary] as const : [secondary, primary] as const;
      function shape(kind: ImageTool, a: [number, number], b: [number, number], button: 0 | 2) {
        const [fore, back] = colors(button);
        if (kind === 'line') return { kind: 'stroke', points: [a, b], size, color: fore, tip: 'round' } as const;
        return { kind: kind as 'rectangle' | 'ellipse', a, b, size, stroke: style === 'fill' ? null : fore, fill: style === 'outline' ? null : style === 'fill' ? fore : back };
      }
      function pointer(event: Parameters<typeof imageToolInput>[0]['event']) {
        if (!raster) return;
        const next = imageToolInput({ state: tool, event, selection: floating ? { x: floating.x, y: floating.y, width: floating.raster.width, height: floating.raster.height } : selection, floating: !!floating });
        tool = next.state; const intent = next.intent;
        if (intent.kind === 'hover') { cursor = intent.point; refresh(); return; }
        if (intent.kind === 'stroke') {
          if (intent.first) { message = ''; strokeDirty = false; }
          const [fore, back] = colors(intent.button), eraser = tool.tool === 'eraser';
          const dirty = paintRaster(raster, { kind: 'stroke', points: intent.points, size: tool.tool === 'pencil' ? 1 : size, color: eraser ? back : fore, tip: tool.tool === 'brush' ? 'round' : 'square' });
          if (dirty) { strokeDirty = true; paint(dirty); }
        } else if (intent.kind === 'stroke-end') { if (strokeDirty) commit(copyRaster(raster), TOOLS[tool.tool].label); strokeDirty = false; }
        else if (intent.kind === 'shape') {
          if (!base) { base = new Uint8ClampedArray(raster.data); lastDirty = null; }
          if (lastDirty) { const r = clip(lastDirty, raster); for (let y = r.y; y < r.y + r.height; y++) { const i = (y * raster.width + r.x) * 4; raster.data.set(base.subarray(i, i + r.width * 4), i); } }
          const dirty = paintRaster(raster, shape(tool.tool, intent.a, intent.b, intent.button)); paint(union(lastDirty, dirty)); lastDirty = dirty;
          if (intent.commit) { base = null; lastDirty = null; if (dirty) commit(copyRaster(raster), `Draw ${TOOLS[tool.tool].label.toLowerCase()}`); }
        } else if (intent.kind === 'fill') {
          const dirty = paintRaster(raster, { kind: 'fill', point: intent.point, color: colors(intent.button)[0] }); if (dirty) { paint(dirty); commit(copyRaster(raster), 'Fill'); }
        } else if (intent.kind === 'pick') {
          const x = Math.floor(intent.point[0]), y = Math.floor(intent.point[1]);
          if (x >= 0 && y >= 0 && x < raster.width && y < raster.height) { const i = (y * raster.width + x) * 4, c = [...raster.data.slice(i, i + 3), 255] as unknown as RGBA; if (intent.button === 0) primary = c; else secondary = c; tool = { tool: previousTool, drag: null }; }
        } else if (intent.kind === 'text') text(intent.point, colors(intent.button)[0]);
        else if (intent.kind === 'marquee') {
          if (intent.drop) drop();
          preview = intent.commit ? null : intent.rect; if (intent.commit) selection = intent.rect ? clip(intent.rect, raster) : null;
          if (selection && (!selection.width || !selection.height)) selection = null;
        } else if (intent.kind === 'move') {
          if (intent.lift) lift();
          if (floating && liftOrigin) { floating.x = liftOrigin.x + intent.dx; floating.y = liftOrigin.y + intent.dy; if (intent.commit) liftOrigin = { x: floating.x, y: floating.y }; }
        } else if (intent.kind === 'cancel') {
          preview = null;
          if (base) { raster.data.set(base); base = null; lastDirty = null; paint(); }
          if (strokeDirty) { strokeDirty = false; resync(); }
        }
        refresh();
      }
      function rasterizeText(value: string, fontSize: number, family: string, bold: boolean, color: RGBA): Raster | null {
        const lines = value.split('\n'), measure = document.createElement('canvas').getContext('2d'); if (!measure || !value.trim()) return null;
        const font = `${bold ? 'bold ' : ''}${fontSize}px ${family}`; measure.font = font;
        const width = Math.ceil(Math.max(...lines.map(line => measure.measureText(line).width))) + 2, lineHeight = Math.ceil(fontSize * 1.25), height = lineHeight * lines.length;
        if (width * height > MAX_PIXELS) throw new RangeError('The text is too large.');
        const out = document.createElement('canvas'); out.width = width; out.height = height; const ctx = out.getContext('2d')!;
        ctx.font = font; ctx.textBaseline = 'top'; ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`; lines.forEach((line, i) => ctx.fillText(line, 1, i * lineHeight + Math.round(fontSize * 0.1)));
        return { width, height, data: ctx.getImageData(0, 0, width, height).data };
      }
      function text(point: [number, number], color: RGBA) {
        if (!raster) return; const at = { x: Math.floor(point[0]), y: Math.floor(point[1]) };
        host.dialog({ title: 'Text', fields: [{ key: 'text', label: 'Text', type: 'text' }, { key: 'size', label: 'Size (px)', type: 'number', min: 4, max: 400, step: 1 },
          { key: 'font', label: 'Font', type: 'select', choices: [{ value: 'sans-serif', label: 'Sans serif' }, { value: 'serif', label: 'Serif' }, { value: 'monospace', label: 'Monospace' }, { value: 'cursive', label: 'Handwriting' }] }, { key: 'bold', label: 'Bold', type: 'checkbox' }],
        initial: { text: '', size: 24, font: 'sans-serif', bold: false },
        validate(values) { const s = Number(values.size); if (!String(values.text).trim()) return { ok: false, error: { code: 'image.text', message: 'Type some text.' } }; if (!Number.isInteger(s) || s < 4 || s > 400) return { ok: false, error: { code: 'image.text', message: 'Size is a whole number from 4 to 400.' } }; return { ok: true, value: values }; },
        preview(value) { const v = value as Record<string, unknown>; try { const r = rasterizeText(String(v.text), Number(v.size), String(v.font), !!v.bold, color); if (r) { floating = { raster: r, x: at.x, y: at.y, label: 'Text' }; showFloat(); layout(); } } catch { /* The validated commit reports size errors. */ } },
        commit(value) { const v = value as Record<string, unknown>; floating = null; try { const r = rasterizeText(String(v.text), Number(v.size), String(v.font), !!v.bold, color); if (r && raster) { paintRaster(raster, { kind: 'blit', source: r, x: at.x, y: at.y, mode: 'over' }); paint(); commit(copyRaster(raster), 'Text'); } } catch (cause) { fail(cause); } },
        cancel() { floating = null; layout(); },
        });
      }
      function transform(op: TransformOp, label: string) { if (!raster) return; drop(); selection = null; try { const next = transformRaster(raster, op); load(copyRaster(next)); commit(next, label); } catch (cause) { fail(cause); } }
      function sizeDialog(kind: 'resize' | 'canvas') {
        if (!raster) return; drop(); const w0 = raster.width, h0 = raster.height;
        host.dialog({ title: kind === 'resize' ? 'Resize image' : 'Canvas size', fields: [{ key: 'width', label: 'Width (px)', type: 'number', min: 1, max: 4096, step: 1 }, { key: 'height', label: 'Height (px)', type: 'number', min: 1, max: 4096, step: 1 }, ...(kind === 'resize' ? [{ key: 'keep', label: 'Keep aspect ratio', type: 'checkbox' as const }] : [])],
          initial: { width: w0, height: h0, ...(kind === 'resize' ? { keep: true } : {}) },
          validate(values) {
            const width = Number(values.width), height = values.keep ? Math.max(1, Math.round(Number(values.width) * h0 / w0)) : Number(values.height);
            if (![width, height].every(v => Number.isInteger(v) && v >= 1) || width * height > MAX_PIXELS) return { ok: false, error: { code: 'image.size', message: `Use whole pixels; at most ${MAX_PIXELS.toLocaleString()} pixels in total.` } };
            return { ok: true, value: { width, height } };
          }, preview() {},
          commit(value) { const v = value as { width: number; height: number }; transform(kind === 'resize' ? { kind: 'resize', ...v } : { kind: 'canvas', ...v, fill: secondary }, kind === 'resize' ? 'Resize image' : 'Canvas size'); },
          cancel() {},
        });
      }
      async function systemCopy(r: Raster) {
        const clip = window.navigator.clipboard as Clipboard | undefined, Item = (window as Window & { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
        if (!clip?.write || !Item) return;
        try { await clip.write([new Item({ 'image/png': png(r) })]); } catch { /* The in-app clipboard still holds the pixels. */ }
      }
      function png(r: Raster): Promise<Blob> {
        const out = document.createElement('canvas'); out.width = r.width; out.height = r.height; out.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
        return new Promise((resolve, reject) => out.toBlob(blob => blob ? resolve(blob) : reject(new Error('The browser could not encode a PNG.')), 'image/png'));
      }
      async function decodeImage(blob: Blob): Promise<Raster> {
        const bitmap = await createImageBitmap(blob);
        try {
          if (bitmap.width * bitmap.height > MAX_PIXELS) throw new RangeError(`Images up to ${MAX_PIXELS.toLocaleString()} pixels can be opened.`);
          const out = document.createElement('canvas'); out.width = bitmap.width; out.height = bitmap.height; const ctx = out.getContext('2d')!; ctx.drawImage(bitmap, 0, 0);
          return { width: bitmap.width, height: bitmap.height, data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
        } finally { bitmap.close(); }
      }
      async function paste() {
        let pasted: Raster | null = null;
        try {
          const items = await window.navigator.clipboard?.read?.();
          for (const item of items ?? []) { const type = item.types.find(t => t.startsWith('image/')); if (type) { pasted = await decodeImage(await item.getType(type)); break; } }
        } catch { /* Permission denied or no image: fall back to the in-app clipboard. */ }
        pasted ??= clipboard ? copyRaster(clipboard) : null;
        if (disposed || !raster || !current) return;
        if (!pasted) { message = 'Nothing to paste. Copy a selection or an image first.'; refresh(); return; }
        drop(); const [x, y] = toDocument({ x: 0, y: 0 });
        floating = { raster: pasted, x: Math.max(0, Math.min(raster.width - 1, Math.ceil(x))), y: Math.max(0, Math.min(raster.height - 1, Math.ceil(y))), label: 'Paste' };
        liftOrigin = { x: floating.x, y: floating.y }; selection = null; tool = { tool: 'select', drag: null }; showFloat(); message = ''; refresh(); host.invalidate();
      }
      async function importImage() {
        const result = await fileAccess({ op: 'open', accept: IMAGE_TYPES }, files);
        if (disposed || 'cancelled' in result) return;
        if (!result.ok) { fail(`${result.error.code}: ${result.error.message}`); return; }
        try {
          const next = await decodeImage(new Blob(result.value.bytes.map(b => b.slice())));
          if (disposed || !current) return; discardFloat(); selection = null; load(copyRaster(next)); fitView(next.width > stage.clientWidth - 2 * MARGIN || next.height > stage.clientHeight - 2 * MARGIN ? 'fit' : 'actual');
          commit(next, 'Import image', current.title === 'Untitled image' ? basename(result.value.name) : undefined);
        } catch (cause) { fail(`This image could not be opened: ${cause instanceof Error ? cause.message : String(cause)}`); }
      }
      async function exportPNG() {
        if (!raster || !current) return; drop();
        try {
          const blob = await png(raster), bytes = new Uint8Array(await blob.arrayBuffer());
          const result = await fileAccess({ op: 'save', name: `${current.title.trim() || 'image'}.png`, mime: 'image/png', bytes }, files);
          if ('cancelled' in result) return; message = result.ok ? `Exported ${result.value.name}.` : `${result.error.code}: ${result.error.message}`; refresh();
        } catch (cause) { fail(cause); }
      }
      /** Shows the whole image (or 100% pixels) centred, whatever the shell zoom and pan are. */
      function fitView(mode: 'fit' | 'actual') {
        if (!raster) return; const w = stage.clientWidth || 800, h = stage.clientHeight || 600;
        const effective = mode === 'actual' ? 1 : Math.min((w - 2 * MARGIN) / raster.width, (h - 2 * MARGIN) / raster.height);
        scale = Math.max(effective, 0.01) / view.zoom; offset = { x: 0, y: 0 };
        const o = origin(); offset = { x: (Math.max(MARGIN, (w - raster.width * scale * view.zoom) / 2) - view.pan.x) / view.zoom - o.x, y: (Math.max(MARGIN, (h - raster.height * scale * view.zoom) / 2) - view.pan.y) / view.zoom - o.y };
      }
      function command(id: string) {
        if (!raster || !current) return;
        message = '';
        const toolId = id.startsWith('image.') ? id.slice(6) as ImageTool : null;
        if (toolId && (IMAGE_TOOLS as readonly string[]).includes(toolId)) { if (toolId !== 'select') drop(); if (toolId === 'picker' && tool.tool !== 'picker') previousTool = tool.tool; tool = imageToolInput({ state: tool, event: { kind: 'tool', tool: toolId }, selection, floating: !!floating }).state; refresh(); return; }
        if (id === 'tool.cancel') { pointer({ kind: 'cancel' }); if (floating) { discardFloat(); selection = null; } else selection = null; preview = null; refresh(); return; }
        if (id === 'tool.confirm') { drop(); refresh(); return; }
        if (id === 'color.swap') { [primary, secondary] = [secondary, primary]; refresh(); return; }
        if (id === 'color.reset') { primary = BLACK; secondary = WHITE; refresh(); return; }
        if (id === 'view.fit' || id === 'image.actualSize') { fitView(id === 'view.fit' ? 'fit' : 'actual'); refresh(); return; }
        if (id === 'edit.selectAll') { drop(); selection = { x: 0, y: 0, width: raster.width, height: raster.height }; tool = { tool: 'select', drag: null }; refresh(); return; }
        if (id === 'edit.copy' || id === 'edit.cut') {
          const pixels = floating ? copyRaster(floating.raster) : selection ? extract(raster, selection) : null; if (!pixels) return;
          clipboard = pixels; void systemCopy(pixels); if (id === 'edit.copy') { message = `Copied ${pixels.width} × ${pixels.height} pixels.`; refresh(); return; }
        }
        if (id === 'edit.cut' || id === 'edit.delete') {
          if (floating) { floating = null; liftOrigin = null; selection = null; commit(copyRaster(raster), id === 'edit.cut' ? 'Cut' : 'Delete selection'); }
          else if (selection) { paintRaster(raster, { kind: 'clear', rect: selection, color: secondary }); paint(selection); selection = null; commit(copyRaster(raster), id === 'edit.cut' ? 'Cut' : 'Delete selection'); }
          refresh(); return;
        }
        if (id === 'edit.paste') { void paste(); return; }
        if (id === 'image.crop') { drop(); if (selection) transform({ kind: 'crop', rect: selection }, 'Crop'); return; }
        if (id === 'image.clear') { drop(); selection = null; const next = createRaster(raster.width, raster.height, secondary); load(copyRaster(next)); commit(next, 'Clear image'); refresh(); return; }
        if (id === 'image.flipH') return transform({ kind: 'flip', axis: 'horizontal' }, 'Flip horizontal');
        if (id === 'image.flipV') return transform({ kind: 'flip', axis: 'vertical' }, 'Flip vertical');
        if (id === 'image.rotateRight') return transform({ kind: 'rotate', turns: 1 }, 'Rotate right');
        if (id === 'image.rotateLeft') return transform({ kind: 'rotate', turns: 3 }, 'Rotate left');
        if (id === 'image.rotate180') return transform({ kind: 'rotate', turns: 2 }, 'Rotate 180°');
        if (id === 'image.invert') return transform({ kind: 'invert' }, 'Invert colours');
        if (id === 'image.resize' || id === 'image.canvasSize') return sizeDialog(id === 'image.resize' ? 'resize' : 'canvas');
        if (id === 'image.import') { void importImage(); return; }
        if (id === 'image.exportPNG') { void exportPNG(); return; }
      }
      const Resize = window.ResizeObserver, observer = Resize ? new Resize(() => layout()) : null; observer?.observe(stage);
      return {
        render(snapshot, nextView) {
          const changed = snapshot?.identity !== current?.identity, opened = snapshot?.id !== current?.id; current = snapshot; view = nextView;
          if (changed) { base = null; lastDirty = null; preview = null; tool = { ...tool, drag: null }; }
          if (!snapshot) { source = null; raster = null; floating = null; selection = null; }
          // Undo, redo, open and rejected commits all arrive as a value this view did not produce.
          else if (snapshot.value !== source || !raster) { floating = null; liftOrigin = null; selection = null; resync(); }
          if (opened && raster) { selection = null; message = ''; fitView(raster.width > stage.clientWidth - 2 * MARGIN || raster.height > stage.clientHeight - 2 * MARGIN ? 'fit' : 'actual'); }
          refresh();
        },
        model() {
          const enabled = !!current, has = enabled && (!!selection || !!floating);
          const item = (id: string, label: string, icon?: string, shortcut = '', toolbar = false, on = enabled) => ({ id, label, shortcut, enabled: on, ...(icon ? { icon } : {}), ...(toolbar ? { toolbar } : {}) });
          return {
            menus: [
              { id: 'select', label: 'Select', items: [item('edit.selectAll', 'Select all', 'select', 'Ctrl+A'), item('edit.copy', 'Copy', 'copy', 'Ctrl+C', false, has), item('edit.cut', 'Cut', 'cut', 'Ctrl+X', false, has), item('edit.paste', 'Paste', 'paste', 'Ctrl+V'), item('edit.delete', 'Delete selection', 'delete', 'Delete', false, has), item('image.crop', 'Crop to selection', 'crop', '', true, has)] },
              { id: 'image', label: 'Image', items: [item('image.import', 'Import image…', 'open', '', true), item('image.exportPNG', 'Export PNG…', 'export', '', true), item('image.resize', 'Resize…', 'fit'), item('image.canvasSize', 'Canvas size…', 'grid'),
                item('image.rotateRight', 'Rotate right', 'rotate', '', true), item('image.rotateLeft', 'Rotate left', 'rotate'), item('image.rotate180', 'Rotate 180°', 'rotate'), item('image.flipH', 'Flip horizontal', 'flip', '', true), item('image.flipV', 'Flip vertical', 'flip'),
                item('image.invert', 'Invert colours'), item('image.clear', 'Clear image', 'delete'), item('view.fit', 'Zoom to fit', 'fit', 'F'), item('image.actualSize', 'Actual pixels', 'zoomIn'), item('color.swap', 'Swap colours', undefined, 'X'), item('color.reset', 'Default colours', undefined, 'D')] },
            ],
            tools: IMAGE_TOOLS.map(id => ({ id: `image.${id}`, label: TOOLS[id].label, icon: TOOLS[id].icon, shortcut: TOOLS[id].key, enabled, status: TOOLS[id].hint, active: enabled && tool.tool === id })),
            panels: [{ id: 'image-colours', title: 'Colours', content: panel }],
          };
        },
        context: () => ({ viewRole: 'canvas2d', activeTool: tool.tool, status: hint.textContent ?? '' }),
        command(id) { try { command(id); } catch (cause) { fail(cause); } host.invalidate(); },
        gesture(gesture) {
          if (!raster || gesture.type !== 'pointer') return;
          if (gesture.button === 1 || panning) {
            if (gesture.phase === 'down' && gesture.button === 1) panning = { ...gesture.point };
            else if (panning && gesture.phase === 'move') { offset = { x: offset.x + (gesture.point.x - panning.x) / view.zoom, y: offset.y + (gesture.point.y - panning.y) / view.zoom }; panning = { ...gesture.point }; layout(); }
            else if (gesture.phase === 'up' || gesture.phase === 'cancel') panning = null;
            return;
          }
          try {
            const point = toDocument(gesture.point); cursor = point;
            if (gesture.phase === 'cancel') pointer({ kind: 'cancel' });
            else pointer({ kind: gesture.phase, point, button: gesture.button, shift: gesture.shift });
          } catch (cause) { fail(cause); }
          if (gesture.phase !== 'move') host.invalidate();
        },
        dispose() { if (disposed) return; disposed = true; observer?.disconnect(); palette.dispose(); host.root.replaceChildren(); },
      };
    },
  };
}
