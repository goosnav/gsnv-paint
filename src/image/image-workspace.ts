/**
 * PURPOSE    Connect the layered Paint/Photoshop-style Image editor to the shared application.
 * KIND       SHELL assembly IMAGE-APP; routing, lifecycle, canvas display and browser I/O only.
 * CONTRACT   IN: S07 file ports and browser DOM/Canvas. OUT: WorkspaceAdapter for gsnv-image.
 *            Pixel decisions belong to raster-ops, image-brush, image-adjust and image-composite; gestures to
 *            image-tool-input; snapshots to image-content. Each completed stroke, shape, fill, gradient, text,
 *            move, adjustment, filter or layer change commits one history entry; drags, adjustment previews
 *            and floating moves stay outside history. Painting is clipped to the selection mask.
 *            RAISES: invalid project content from decode; operational failures show in the hint.
 * GUARANTEES Saved files contain the exact committed layers; undo/redo/open resynchronize every layer.
 * TUNING     NEW_SIZE, MARGIN, SPRAY_INTERVAL_MS and text defaults below.
 * DECISIONS  D1: One working raster per layer, mutated during a drag from a per-stroke base copy, committed
 *            as shared tiles. D2: A moved selection floats until placed (click outside, Enter, tool change);
 *            Esc cancels. D3: Paste creates a new layer, as in Photoshop and GIMP.
 * LIMITS     No layer masks, groups or editable text. Image import/export uses browser codecs.
 * TESTBENCH  src/image/image-workspace.browser.spec.ts -- run with: npm run test:browser -- src/image/image-workspace.browser.spec.ts
 */
import type { WorkspaceAdapter } from '../app/app-shell.ts';
import type { View2D } from '../shared/view-transform.ts';
import type { DialogSpec } from '../shared/dialog.ts';
import { fileAccess, type FilePorts } from '../shared/file-access.ts';
import { imageContent, type ImageContent, type LayerMeta } from './image-content.ts';
import { paintRaster, transformRaster, clip, createRaster, MAX_PIXELS, type Raster, type RGBA, type Rect, type TransformOp } from './raster-ops.ts';
import { imageToolInput, IMAGE_TOOLS, type ImageTool, type ImageToolState, type SelectMode } from './image-tool-input.ts';
import { imagePalette, DEFAULT_OPTIONS, type ToolOptions } from './image-palette.ts';
import { imageLayersPanel, type LayerAction } from './image-layers-panel.ts';
import { compositeLayers, maskedMerge, type CompositeLayer } from './image-composite.ts';
import { dabLine, dab, spray, smudgeDab, applyCoverage, gradientFill, shapeMask, magicWand, combineMasks, maskBounds, type Coverage, type CoverageMode, type SmudgeCarry } from './image-brush.ts';
import { adjustRaster, blurRaster, type AdjustOp } from './image-adjust.ts';
import './image-workspace.css';

type Snapshot = Parameters<ReturnType<WorkspaceAdapter['mount']>['render']>[0];
type Selection = { mask: Uint8Array; bounds: Rect };
type Floating = { raster: Raster; x: number; y: number; origin: { x: number; y: number }; label: string };
type Stroke = { base: Uint8ClampedArray; cov: Coverage; carry: number; mode: CoverageMode | 'pencil' | 'smudge'; dirty: Rect | null; timer: number | null; last: [number, number]; seed: number };
const NEW_SIZE = { width: 800, height: 600 }, MARGIN = 24, SPRAY_INTERVAL_MS = 40;
const BLACK: RGBA = [0, 0, 0, 255], WHITE: RGBA = [255, 255, 255, 255];
const IMAGE_TYPES = { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/gif': ['.gif'], 'image/webp': ['.webp'], 'image/bmp': ['.bmp'] };
const TOOLS: Record<ImageTool, { label: string; icon: string; key: string; hint: string }> = {
  move: { label: 'Move', icon: 'move', key: 'V', hint: 'Drag to move the selection, or the whole layer when nothing is selected · Enter places it.' },
  select: { label: 'Rectangle select', icon: 'select', key: 'S', hint: 'Drag to select · Shift adds, Ctrl subtracts · drag inside to move the pixels.' },
  ellipseSelect: { label: 'Ellipse select', icon: 'ellipseSelect', key: 'M', hint: 'Drag to select an ellipse · Shift adds, Ctrl subtracts.' },
  lasso: { label: 'Lasso', icon: 'lasso', key: 'Q', hint: 'Drag around an area to select it freehand · Shift adds, Ctrl subtracts.' },
  wand: { label: 'Magic wand', icon: 'wand', key: 'W', hint: 'Click to select similar colours · Tolerance and Contiguous are in Tool options.' },
  pencil: { label: 'Pencil', icon: 'pencil', key: 'P', hint: 'Hard-edged pixels · left button: primary colour · right: secondary.' },
  brush: { label: 'Brush', icon: 'brush', key: 'B', hint: 'Soft round brush · Size, Hardness, Opacity and Flow are in Tool options · [ ] change size.' },
  airbrush: { label: 'Airbrush', icon: 'airbrush', key: 'A', hint: 'Sprays while you hold the button · Density sets how fast paint builds up.' },
  eraser: { label: 'Eraser', icon: 'eraser', key: 'E', hint: 'Erases to transparency (to the secondary colour on the bottom layer).' },
  clone: { label: 'Clone stamp', icon: 'clone', key: 'C', hint: 'Ctrl-click to choose the source, then paint to copy from it.' },
  blur: { label: 'Blur brush', icon: 'blur', key: 'U', hint: 'Paint to soften detail.' },
  smudge: { label: 'Smudge', icon: 'smudge', key: 'K', hint: 'Drag to push colour along the stroke · Strength sets how far it carries.' },
  fill: { label: 'Fill', icon: 'fill', key: 'G', hint: 'Click to fill similar colours · Tolerance and Contiguous are in Tool options.' },
  gradient: { label: 'Gradient', icon: 'gradient', key: 'N', hint: 'Drag to draw a gradient from the primary colour · Shift snaps to 45°.' },
  picker: { label: 'Pick colour', icon: 'picker', key: 'I', hint: 'Click to pick the primary colour · right-click picks the secondary colour.' },
  text: { label: 'Text', icon: 'text', key: 'T', hint: 'Click where the text should start.' },
  line: { label: 'Line', icon: 'line', key: 'L', hint: 'Drag to draw a line · Shift snaps to 45°.' },
  rectangle: { label: 'Rectangle', icon: 'rectangle', key: 'R', hint: 'Drag to draw a rectangle · Shift draws a square.' },
  ellipse: { label: 'Ellipse', icon: 'ellipse', key: 'O', hint: 'Drag to draw an ellipse · Shift draws a circle.' },
};
const copyRaster = (r: Raster): Raster => ({ width: r.width, height: r.height, data: new Uint8ClampedArray(r.data) });
const basename = (name: string) => name.replace(/\.[^.]+$/, '') || 'Untitled image';
const union = (a: Rect | null, b: Rect | null): Rect | null => !a ? b : !b ? a : { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x), height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y) };
const meta = (l: LayerMeta): LayerMeta => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend });
const newId = () => `layer-${crypto.randomUUID().slice(0, 8)}`;

export function createImageWorkspace(files: FilePorts): WorkspaceAdapter {
  return {
    create: () => ({ id: crypto.randomUUID(), title: 'Untitled image', format: 'gsnv-image', version: 1, value: imageContent({ operation: 'new', ...NEW_SIZE, fill: WHITE }) }),
    decode(packageValue) {
      const p = packageValue.project;
      if (p.format !== 'gsnv-image') throw new Error('This is not a gsnv-image project.');
      return { id: p.id, title: p.title, format: p.format, version: p.version, value: imageContent({ operation: 'decode', content: p.content, assets: packageValue.assets }) };
    },
    encode(document) {
      const encoded = imageContent({ operation: 'encode', value: document.value as ImageContent });
      return { project: { format: 'gsnv-image', version: 1, id: document.id, title: document.title, content: encoded.content }, assets: encoded.assets.map(a => ({ id: a.id, mime: 'application/octet-stream', bytes: a.bytes })) };
    },
    mount(host) {
      const document = host.root.ownerDocument, window = document.defaultView!;
      const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string) => { const node = document.createElement(tag); node.className = className; return node; };
      const stage = make('div', 'image-stage'), surface = make('div', 'image-surface'), canvas = make('canvas', 'image-canvas'), float = make('canvas', 'image-floating'), overlay = make('canvas', 'image-overlay');
      const ring = make('div', 'image-brush-ring'), hint = make('div', 'image-tool-hint'), notice = make('div', 'image-empty'), optionsPanel = document.createElement('div'), layersPanel = document.createElement('div');
      stage.tabIndex = -1; canvas.setAttribute('aria-label', 'Image canvas'); notice.textContent = 'Choose New (Ctrl+N) to start an image, or Open (Ctrl+O) a .gsnv-image project.';
      surface.append(canvas, float, overlay); stage.append(surface, ring, notice); host.root.append(stage, hint);
      const context = canvas.getContext('2d'), floatContext = float.getContext('2d'), overlayContext = overlay.getContext('2d');
      let current: Snapshot, source: ImageContent | null = null, rasters = new Map<string, Raster>(), display: ImageData | null = null, view: View2D = { zoom: 1, pan: { x: 0, y: 0 } };
      let tool: ImageToolState = { tool: 'brush', drag: null }, previousTool: ImageTool = 'brush', primary = BLACK, secondary = WHITE, options: ToolOptions = { ...DEFAULT_OPTIONS };
      let selection: Selection | null = null, floating: Floating | null = null, stroke: Stroke | null = null, shapeBase: Uint8ClampedArray | null = null, shapeDirty: Rect | null = null;
      let smudge: SmudgeCarry | null = null, cloneSource: [number, number] | null = null, opacityPreview: number | null = null, edges: Int32Array | null = null, phase = 0;
      let scale = 1, offset = { x: 0, y: 0 }, panning: { x: number; y: number } | null = null, cursor: [number, number] | null = null, message = '', disposed = false, marquee: { shape: string; points: [number, number][] } | null = null;
      const palette = imagePalette({ root: optionsPanel, onChange(change) {
        if (change.kind === 'primary') primary = change.color; else if (change.kind === 'secondary') secondary = change.color;
        else if (change.kind === 'swap') [primary, secondary] = [secondary, primary]; else if (change.kind === 'option') options = { ...options, [change.key]: change.value };
        refresh();
      } });
      const layers = imageLayersPanel({ root: layersPanel, onAction: layerAction });
      const antTimer = window.setInterval(() => { if (edges && !disposed) { phase = (phase + 1) % 8; drawOverlay(); } }, 160);

      const activeId = () => source?.activeLayerId ?? '';
      const active = () => rasters.get(activeId())!;
      const isBottom = () => !!source && source.layers[0]!.id === activeId();
      const origin = () => { const w = stage.clientWidth || 800, h = stage.clientHeight || 600, iw = (source?.width ?? 0) * scale, ih = (source?.height ?? 0) * scale; return { x: Math.max(MARGIN, (w - iw) / 2) + offset.x, y: Math.max(MARGIN, (h - ih) / 2) + offset.y }; };
      // The surface is placed on whole screen pixels for crisp rendering; pointer mapping uses the same placement.
      const placement = () => { const o = origin(); return { x: Math.round(view.pan.x + view.zoom * o.x), y: Math.round(view.pan.y + view.zoom * o.y), z: view.zoom * scale }; };
      const toDocument = (p: { x: number; y: number }): [number, number] => { const t = placement(); return [(p.x - t.x) / t.z, (p.y - t.y) / t.z]; };
      const fail = (cause: unknown) => { message = cause instanceof Error ? cause.message : String(cause); refresh(); };
      const fullRect = (): Rect => ({ x: 0, y: 0, width: source?.width ?? 0, height: source?.height ?? 0 });
      const area = () => selection?.bounds ?? fullRect();

      function composite(rect: Rect | null = null) {
        if (!source || !context || !display) return;
        const r = clip(rect ?? fullRect(), source); if (!r.width || !r.height) return;
        const stack: CompositeLayer[] = source.layers.map(l => ({ raster: rasters.get(l.id)!, visible: l.visible, opacity: l.id === activeId() && opacityPreview !== null ? opacityPreview : l.opacity, blend: l.blend }));
        compositeLayers({ width: source.width, height: source.height, layers: stack, rect: r, out: display.data });
        context.putImageData(display, 0, 0, r.x, r.y, r.width, r.height);
      }
      function resync() {
        if (!current) return; source = current.value as ImageContent;
        rasters = new Map(source.layers.map(l => [l.id, imageContent({ operation: 'raster', value: source!, layerId: l.id })]));
        for (const c of [canvas, overlay]) { c.width = source.width; c.height = source.height; }
        display = new ImageData(source.width, source.height); composite(); selectionChanged();
      }
      function selectionChanged() {
        edges = null;
        if (selection && source) {
          const { mask } = selection, w = source.width, h = source.height, list: number[] = [], b = selection.bounds;
          for (let y = b.y; y < b.y + b.height; y++) for (let x = b.x; x < b.x + b.width; x++) {
            const p = y * w + x; if (!mask[p]) continue;
            if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[p - 1] || !mask[p + 1] || !mask[p - w] || !mask[p + w]) list.push(p);
          }
          edges = Int32Array.from(list);
        }
        drawOverlay();
      }
      function drawOverlay() {
        if (!overlayContext || !source) return;
        overlayContext.clearRect(0, 0, overlay.width, overlay.height);
        if (edges && edges.length) {
          const data = overlayContext.createImageData(source.width, source.height), w = source.width;
          for (const p of edges) { const x = p % w, y = (p - x) / w, on = ((x + y + phase) >> 2) & 1, i = p * 4; data.data[i] = data.data[i + 1] = data.data[i + 2] = on ? 255 : 0; data.data[i + 3] = 255; }
          overlayContext.putImageData(data, 0, 0);
        }
        if (marquee && marquee.points.length) {
          const unit = 1 / Math.max(1, scale * view.zoom);
          overlayContext.save(); overlayContext.lineWidth = unit; overlayContext.setLineDash([4 * unit]); overlayContext.strokeStyle = '#000'; overlayContext.beginPath();
          const a = marquee.points[0]!, b = marquee.points[1];
          if (marquee.shape === 'polygon') { marquee.points.forEach((p, i) => i ? overlayContext.lineTo(p[0], p[1]) : overlayContext.moveTo(p[0], p[1])); overlayContext.closePath(); }
          else if (b) { const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]); if (marquee.shape === 'ellipse') overlayContext.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); else overlayContext.rect(Math.floor(x) + 0.5, Math.floor(y) + 0.5, Math.ceil(w), Math.ceil(h)); }
          overlayContext.stroke(); overlayContext.strokeStyle = '#fff'; overlayContext.lineDashOffset = 4 * unit; overlayContext.stroke(); overlayContext.restore();
        }
      }
      function layout() {
        const t = placement(), z = t.z;
        surface.style.transform = `translate(${t.x}px,${t.y}px) scale(${z})`;
        surface.style.width = `${source?.width ?? 0}px`; surface.style.height = `${source?.height ?? 0}px`; surface.dataset.zoom = z >= 1 ? 'pixels' : 'smooth';
        if (floating) { float.hidden = false; float.style.left = `${floating.x}px`; float.style.top = `${floating.y}px`; } else if (!document.querySelector('dialog[open]')) float.hidden = true;
      }
      function thumbnails() {
        const map = new Map<string, HTMLCanvasElement>(); if (!source) return map;
        for (const l of source.layers) {
          const t = document.createElement('canvas'); t.className = 'image-layer-thumb'; t.width = 32; t.height = Math.max(8, Math.min(32, Math.round(32 * source.height / source.width)));
          const raster = rasters.get(l.id), ctx = t.getContext('2d');
          if (raster && ctx) { const tmp = document.createElement('canvas'); tmp.width = raster.width; tmp.height = raster.height; tmp.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height), 0, 0); ctx.drawImage(tmp, 0, 0, t.width, t.height); }
          map.set(l.id, t);
        }
        return map;
      }
      let thumbsFor: ImageContent | null = null, thumbCache = new Map<string, HTMLCanvasElement>();
      function refresh() {
        if (disposed) return;
        notice.hidden = !!current; surface.hidden = !current; layout(); stage.dataset.tool = tool.tool;
        hint.textContent = message || (current ? TOOLS[tool.tool].hint : 'New (Ctrl+N) starts an image.');
        const parts = source ? [`${source.width} × ${source.height} px`, `${Math.round(view.zoom * scale * 100)}%`] : [];
        if (cursor && source) parts.push(`${Math.floor(cursor[0])}, ${Math.floor(cursor[1])}`);
        const s = floating ? { width: floating.raster.width, height: floating.raster.height } : selection?.bounds; if (s) parts.push(`selection ${s.width} × ${s.height}`);
        palette.update({ primary, secondary, tool: tool.tool, options, info: parts.join(' · '), enabled: !!current });
        if (source !== thumbsFor) { thumbsFor = source; thumbCache = thumbnails(); }
        layers.update({ layers: source?.layers.map(l => l.id === activeId() && opacityPreview !== null ? { ...meta(l), opacity: opacityPreview } : meta(l)) ?? [], activeLayerId: activeId(), thumbnails: thumbCache, enabled: !!current });
        if (current && document.activeElement === document.body && !document.querySelector('dialog[open]')) stage.focus();
      }
      function commitActive(label: string) {
        if (!current || !source) return;
        try { const value = imageContent({ operation: 'update', previous: source, layerId: activeId(), raster: active() }); source = value; message = ''; host.commit({ ...current, value }, label, current.identity); }
        catch (cause) { fail(cause); }
      }
      function commitStack(label: string, stack: { meta: LayerMeta; raster?: Raster; from?: string }[], activeLayerId: string, size = { width: source!.width, height: source!.height }) {
        if (!current || !source) return;
        try { const value = imageContent({ operation: 'layers', previous: source, width: size.width, height: size.height, layers: stack, activeLayerId }); message = ''; host.commit({ ...current, value }, label, current.identity); }
        catch (cause) { fail(cause); }
      }
      function placeFloating() {
        if (!floating || !source) return;
        const f = floating; floating = null; const raster = active();
        paintRaster(raster, { kind: 'blit', source: f.raster, x: f.x, y: f.y, mode: 'over' });
        const mask = new Uint8Array(source.width * source.height);
        for (let y = 0; y < f.raster.height; y++) for (let x = 0; x < f.raster.width; x++) { const px = x + f.x, py = y + f.y; if (px >= 0 && py >= 0 && px < source.width && py < source.height && f.raster.data[(y * f.raster.width + x) * 4 + 3]) mask[py * source.width + px] = 255; }
        const b = maskBounds(mask, source.width); selection = b ? { mask, bounds: b } : null;
        composite(); selectionChanged(); commitActive(f.label);
      }
      function lift() {
        if (!source || floating) return;
        const raster = active(), sel = selection ?? { mask: new Uint8Array(source.width * source.height).fill(255), bounds: fullRect() }, b = sel.bounds;
        const out = createRaster(b.width, b.height, [0, 0, 0, 0]), fillColor = isBottom() ? secondary : null;
        for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
          const p = (y + b.y) * source.width + x + b.x, m = sel.mask[p]!; if (!m) continue;
          const i = p * 4, o = (y * b.width + x) * 4;
          out.data[o] = raster.data[i]!; out.data[o + 1] = raster.data[i + 1]!; out.data[o + 2] = raster.data[i + 2]!; out.data[o + 3] = Math.round(raster.data[i + 3]! * m / 255);
          if (fillColor) raster.data.set(fillColor, i); else raster.data[i + 3] = 0;
        }
        floating = { raster: out, x: b.x, y: b.y, origin: { x: b.x, y: b.y }, label: 'Move' }; selection = null; selectionChanged();
        float.width = b.width; float.height = b.height; floatContext?.putImageData(new ImageData(new Uint8ClampedArray(out.data), b.width, b.height), 0, 0); composite(b);
      }
      const colors = (button: 0 | 2) => button === 0 ? [primary, secondary] as const : [secondary, primary] as const;
      const withOpacity = (color: RGBA): RGBA => [color[0], color[1], color[2], Math.round(color[3] * options.opacity / 100)];
      function finishStroke() {
        if (!stroke) return; if (stroke.timer !== null) window.clearInterval(stroke.timer);
        const changed = !!stroke.dirty; stroke = null; if (changed) commitActive(TOOLS[tool.tool].label);
      }
      function strokeApply(rect: Rect | null) {
        if (!stroke || !rect || !source) return; const raster = active();
        if (stroke.mode !== 'pencil' && stroke.mode !== 'smudge') applyCoverage({ raster, base: stroke.base, cov: stroke.cov, rect, mode: stroke.mode, opacity: options.opacity / 100 });
        if (selection) maskedMerge({ target: raster, base: stroke.base, mask: selection.mask, rect });
        stroke.dirty = union(stroke.dirty, rect); composite(rect);
      }
      function strokeTo(points: [number, number][], button: 0 | 2, first: boolean) {
        if (!source) return; const raster = active(), t = tool.tool;
        if (first) {
          message = '';
          if (t === 'clone' && !cloneSource) { message = 'Ctrl-click to choose a clone source first.'; return; }
          const base = new Uint8ClampedArray(raster.data), [fore, back] = colors(button);
          let mode: Stroke['mode'] = 'pencil';
          if (t === 'brush' || t === 'airbrush') mode = { kind: 'paint', color: fore };
          else if (t === 'eraser') mode = isBottom() ? { kind: 'paint', color: back } : { kind: 'erase' };
          else if (t === 'clone') mode = { kind: 'clone', source: base, dx: Math.round(cloneSource![0] - points[0]![0]), dy: Math.round(cloneSource![1] - points[0]![1]) };
          else if (t === 'smudge') { mode = 'smudge'; smudge = null; }
          else if (t === 'blur') mode = { kind: 'filter', filtered: blurRaster({ width: raster.width, height: raster.height, data: base }, Math.max(2, options.size / 6)) };
          stroke = { base, cov: { width: raster.width, height: raster.height, data: new Float32Array(raster.width * raster.height) }, carry: 0, mode, dirty: null, timer: null, last: points[0]!, seed: Date.now() & 0xffff };
          if (t === 'airbrush') stroke.timer = window.setInterval(() => { if (stroke) strokeApply(spray(stroke.cov, stroke.last[0], stroke.last[1], options.size / 2, Math.ceil(options.density / 4), ++stroke.seed)); }, SPRAY_INTERVAL_MS);
        }
        if (!stroke) return;
        const s = stroke, last = points[points.length - 1]!; s.last = last;
        if (s.mode === 'pencil') { strokeApply(paintRaster(raster, { kind: 'stroke', points, size: options.size, color: colors(button)[0], tip: 'square' })); return; }
        if (s.mode === 'smudge') {
          const from = points[0]!, length = Math.hypot(last[0] - from[0], last[1] - from[1]), step = Math.max(1, options.size * 0.1); let rect: Rect | null = null;
          if (!smudge) smudge = smudgeDab(raster, null, from, options.size, options.hardness / 100, options.strength / 100).carry;
          for (let d = step; d <= length + 0.001; d += step) { const r = smudgeDab(raster, smudge, [from[0] + (last[0] - from[0]) * d / length, from[1] + (last[1] - from[1]) * d / length], options.size, options.hardness / 100, options.strength / 100); smudge = r.carry; rect = union(rect, r.rect); }
          strokeApply(rect); return;
        }
        if (t === 'airbrush') { strokeApply(spray(s.cov, last[0], last[1], options.size / 2, Math.ceil(options.density / 4), ++s.seed)); return; }
        const hardness = options.hardness / 100, flow = t === 'brush' ? options.flow / 100 : 1;
        if (points.length === 1) strokeApply(dab(s.cov, last[0], last[1], options.size, hardness, flow));
        else { const r = dabLine(s.cov, points[0]!, last, options.size, hardness, flow, s.carry); s.carry = r.carry; strokeApply(r.rect); }
      }
      function shapeTo(a: [number, number], b: [number, number], button: 0 | 2, commit: boolean) {
        if (!source) return; const raster = active();
        if (!shapeBase) { shapeBase = new Uint8ClampedArray(raster.data); shapeDirty = null; }
        raster.data.set(shapeBase);
        const [fore, back] = colors(button), t = tool.tool;
        let dirty: Rect | null;
        if (t === 'gradient') dirty = gradientFill(raster, a, b, options.gradient, withOpacity(fore), options.gradientEnd === 'transparent' ? [fore[0], fore[1], fore[2], 0] : withOpacity(back));
        else if (t === 'line') dirty = paintRaster(raster, { kind: 'stroke', points: [a, b], size: options.size, color: fore, tip: 'round' });
        else dirty = paintRaster(raster, { kind: t as 'rectangle' | 'ellipse', a, b, size: options.size, stroke: options.style === 'fill' ? null : fore, fill: options.style === 'outline' ? null : options.style === 'fill' ? fore : back });
        const rect = union(shapeDirty, dirty); shapeDirty = dirty;
        if (selection && rect) maskedMerge({ target: raster, base: shapeBase, mask: selection.mask, rect });
        composite(rect);
        if (commit) { shapeBase = null; shapeDirty = null; if (dirty) commitActive(t === 'gradient' ? 'Gradient' : `Draw ${TOOLS[t].label.toLowerCase()}`); }
      }
      function setSelection(mask: Uint8Array | null, mode: SelectMode) {
        if (!source) return;
        const next = mask ? combineMasks(selection?.mask ?? null, mask, mode) : mode === 'replace' ? null : selection?.mask ?? null;
        const bounds = next ? maskBounds(next, source.width) : null; selection = next && bounds ? { mask: next, bounds } : null; selectionChanged();
      }
      function fillAt(point: [number, number], button: 0 | 2) {
        if (!source) return;
        const raster = active(), mask = magicWand(raster, point[0], point[1], options.tolerance, options.contiguous);
        if (selection) for (let i = 0; i < mask.length; i++) mask[i] = Math.min(mask[i]!, selection.mask[i]!);
        const bounds = maskBounds(mask, source.width); if (!bounds) return;
        const base = new Uint8ClampedArray(raster.data), cov = { width: raster.width, height: raster.height, data: Float32Array.from(mask, m => m / 255) };
        applyCoverage({ raster, base, cov, rect: bounds, mode: { kind: 'paint', color: colors(button)[0] }, opacity: options.opacity / 100 });
        composite(bounds); commitActive('Fill');
      }
      function pointer(event: Parameters<typeof imageToolInput>[0]['event']) {
        if (!source) return;
        const inside = (p: [number, number]) => {
          const x = Math.floor(p[0]), y = Math.floor(p[1]);
          if (floating) return x >= floating.x && y >= floating.y && x < floating.x + floating.raster.width && y < floating.y + floating.raster.height;
          return !!selection && x >= 0 && y >= 0 && x < source!.width && y < source!.height && !!selection.mask[y * source!.width + x];
        };
        const next = imageToolInput({ state: tool, event, inside, floating: !!floating }); tool = next.state; const intent = next.intent;
        if (intent.kind === 'hover' || intent.kind === 'stroke') showRing(intent.kind === 'hover' ? intent.point : intent.points[intent.points.length - 1]!);
        if (intent.kind === 'hover') { stage.dataset.hover = (tool.tool === 'move' || ['select', 'ellipseSelect', 'lasso'].includes(tool.tool)) && inside(intent.point) ? 'selection' : ''; cursor = intent.point; refresh(); return; }
        if (intent.kind === 'stroke') strokeTo(intent.points, intent.button, intent.first);
        else if (intent.kind === 'stroke-end') finishStroke();
        else if (intent.kind === 'shape') shapeTo(intent.a, intent.b, intent.button, intent.commit);
        else if (intent.kind === 'fill') fillAt(intent.point, intent.button);
        else if (intent.kind === 'pick') {
          const x = Math.floor(intent.point[0]), y = Math.floor(intent.point[1]);
          if (display && x >= 0 && y >= 0 && x < source.width && y < source.height) { const i = (y * source.width + x) * 4, c: RGBA = [display.data[i]!, display.data[i + 1]!, display.data[i + 2]!, 255]; if (intent.button === 0) primary = c; else secondary = c; tool = { tool: previousTool, drag: null }; }
        } else if (intent.kind === 'clone-source') { cloneSource = [intent.point[0], intent.point[1]]; message = `Clone source set at ${Math.floor(intent.point[0])}, ${Math.floor(intent.point[1])}.`; }
        else if (intent.kind === 'text') text(intent.point, colors(intent.button)[0]);
        else if (intent.kind === 'wand') setSelection(magicWand(active(), intent.point[0], intent.point[1], options.tolerance, options.contiguous), intent.mode);
        else if (intent.kind === 'marquee') {
          if (intent.drop) placeFloating();
          marquee = intent.commit ? null : { shape: intent.shape, points: intent.points };
          if (intent.commit) {
            const valid = intent.shape === 'polygon' ? intent.points.length > 2 : intent.points.length === 2;
            setSelection(valid ? shapeMask(source.width, source.height, intent.shape === 'polygon' ? { kind: 'polygon', points: intent.points } : { kind: intent.shape, a: intent.points[0]!, b: intent.points[1]! }) : null, valid ? intent.mode : 'replace');
          } else drawOverlay();
        } else if (intent.kind === 'move') {
          if (intent.lift) lift();
          if (floating) { floating.x = floating.origin.x + intent.dx; floating.y = floating.origin.y + intent.dy; if (intent.commit) floating.origin = { x: floating.x, y: floating.y }; }
        } else if (intent.kind === 'cancel') {
          marquee = null; drawOverlay();
          if (shapeBase) { active().data.set(shapeBase); shapeBase = null; shapeDirty = null; composite(); }
          if (stroke) { if (stroke.timer !== null) window.clearInterval(stroke.timer); active().data.set(stroke.base); stroke = null; composite(); }
        }
        refresh();
      }
      /** Photoshop-style outline of the brush footprint, so size is visible before and while painting. */
      function showRing(point: [number, number]) {
        const t = placement(), d = options.size * t.z, sized = ['brush', 'airbrush', 'eraser', 'clone', 'blur', 'smudge', 'pencil'].includes(tool.tool);
        ring.hidden = !sized || d < 5;
        if (!ring.hidden) Object.assign(ring.style, { width: `${Math.round(d)}px`, height: `${Math.round(d)}px`, left: `${Math.round(t.x + point[0] * t.z - d / 2)}px`, top: `${Math.round(t.y + point[1] * t.z - d / 2)}px` });
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
        if (!source) return; const at = { x: Math.floor(point[0]), y: Math.floor(point[1]) };
        const show = (r: Raster | null) => { if (r) { float.width = r.width; float.height = r.height; floatContext?.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0); float.style.left = `${at.x}px`; float.style.top = `${at.y}px`; float.hidden = false; } else float.hidden = true; };
        host.dialog({ title: 'Text', fields: [{ key: 'text', label: 'Text', type: 'text' }, { key: 'size', label: 'Size (px)', type: 'number', min: 4, max: 400, step: 1 },
          { key: 'font', label: 'Font', type: 'select', choices: [{ value: 'Tahoma, Verdana, sans-serif', label: 'Tahoma' }, { value: 'Verdana, sans-serif', label: 'Verdana' }, { value: '"Times New Roman", serif', label: 'Times New Roman' }, { value: '"Courier New", monospace', label: 'Courier New' }, { value: '"Comic Sans MS", cursive', label: 'Comic Sans' }, { value: '"Pixel Tahoma"', label: 'Pixel Tahoma (11 / 22 px)' }] }, { key: 'bold', label: 'Bold', type: 'checkbox' }],
          initial: { text: '', size: 24, font: 'Tahoma, Verdana, sans-serif', bold: false },
          validate(values) { const s = Number(values.size); if (!String(values.text).trim()) return { ok: false, error: { code: 'image.text', message: 'Type some text.' } }; if (!Number.isInteger(s) || s < 4 || s > 400) return { ok: false, error: { code: 'image.text', message: 'Size is a whole number from 4 to 400.' } }; return { ok: true, value: values }; },
          preview(value) { const v = value as Record<string, unknown>; try { show(rasterizeText(String(v.text), Number(v.size), String(v.font), !!v.bold, color)); } catch { show(null); } },
          commit(value) { const v = value as Record<string, unknown>; show(null); try { const r = rasterizeText(String(v.text), Number(v.size), String(v.font), !!v.bold, color); if (r && source) { const raster = active(), base = new Uint8ClampedArray(raster.data); paintRaster(raster, { kind: 'blit', source: r, x: at.x, y: at.y, mode: 'over' }); if (selection) maskedMerge({ target: raster, base, mask: selection.mask, rect: fullRect() }); composite(); commitActive('Text'); } } catch (cause) { fail(cause); } },
          cancel() { show(null); },
        });
      }
      function transformAll(op: TransformOp, label: string) {
        if (!source) return; placeFloating(); selection = null; selectionChanged();
        try {
          const bottom = source.layers[0]!.id, stack = source.layers.map(l => ({ meta: meta(l), raster: transformRaster(rasters.get(l.id)!, op.kind === 'canvas' && l.id !== bottom ? { ...op, fill: [0, 0, 0, 0] } : op) }));
          commitStack(label, stack, activeId(), { width: stack[0]!.raster.width, height: stack[0]!.raster.height });
        } catch (cause) { fail(cause); }
      }
      function sizeDialog(kind: 'resize' | 'canvas') {
        if (!source) return; placeFloating(); const w0 = source.width, h0 = source.height;
        host.dialog({ title: kind === 'resize' ? 'Resize image' : 'Canvas size', fields: [{ key: 'width', label: 'Width (px)', type: 'number', min: 1, max: 4096, step: 1 }, { key: 'height', label: 'Height (px)', type: 'number', min: 1, max: 4096, step: 1 }, ...(kind === 'resize' ? [{ key: 'keep', label: 'Keep aspect ratio', type: 'checkbox' as const }] : [])],
          initial: { width: w0, height: h0, ...(kind === 'resize' ? { keep: true } : {}) },
          validate(values) {
            const width = Number(values.width), height = values.keep ? Math.max(1, Math.round(Number(values.width) * h0 / w0)) : Number(values.height);
            if (![width, height].every(v => Number.isInteger(v) && v >= 1) || width * height > MAX_PIXELS) return { ok: false, error: { code: 'image.size', message: `Use whole pixels; at most ${MAX_PIXELS.toLocaleString()} pixels in total.` } };
            return { ok: true, value: { width, height } };
          }, preview() {},
          commit(value) { const v = value as { width: number; height: number }; transformAll(kind === 'resize' ? { kind: 'resize', ...v } : { kind: 'canvas', ...v, fill: secondary }, kind === 'resize' ? 'Resize image' : 'Canvas size'); },
          cancel() {},
        });
      }
      /** Live-preview adjustment dialog applied to the active layer inside the selection. */
      function adjust(title: string, fields: DialogSpec['fields'], initial: DialogSpec['initial'], toOp: (v: Record<string, unknown>) => AdjustOp) {
        if (!source) return; placeFloating();
        const raster = active(), base = new Uint8ClampedArray(raster.data), rect = area();
        const run = (v: Record<string, unknown>) => { raster.data.set(base); adjustRaster(raster, toOp(v), rect); if (selection) maskedMerge({ target: raster, base, mask: selection.mask, rect }); composite(rect); };
        if (!fields.length) { try { run({}); commitActive(title); } catch (cause) { raster.data.set(base); composite(rect); fail(cause); } return; }
        host.dialog({ title, fields, initial,
          validate(values) { try { adjustRaster({ width: 1, height: 1, data: new Uint8ClampedArray(4) }, toOp(values)); return { ok: true, value: values }; } catch (cause) { return { ok: false, error: { code: 'image.adjust', message: cause instanceof Error ? cause.message : String(cause) } }; } },
          preview(value) { run(value as Record<string, unknown>); },
          commit(value) { run(value as Record<string, unknown>); commitActive(title); },
          cancel() { raster.data.set(base); composite(rect); },
        });
      }
      const num = (key: string, label: string, min: number, max: number, step = 1) => ({ key, label, type: 'number' as const, min, max, step });
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
      function flattened(): Raster { const out = createRaster(source!.width, source!.height, [0, 0, 0, 0]); compositeLayers({ width: out.width, height: out.height, layers: source!.layers.map(l => ({ raster: rasters.get(l.id)!, visible: l.visible, opacity: l.opacity, blend: l.blend })), rect: fullRect(), out: out.data }); return out; }
      function selectedPixels(): Raster | null {
        if (floating) return copyRaster(floating.raster); if (!selection || !source) return null;
        const b = selection.bounds, raster = active(), out = createRaster(b.width, b.height, [0, 0, 0, 0]);
        for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) { const p = (y + b.y) * source.width + x + b.x, m = selection.mask[p]!; if (!m) continue; const i = p * 4, o = (y * b.width + x) * 4; out.data.set(raster.data.subarray(i, i + 3), o); out.data[o + 3] = Math.round(raster.data[i + 3]! * m / 255); }
        return out;
      }
      let clipboard: Raster | null = null;
      async function systemCopy(r: Raster) { const clip = window.navigator.clipboard as Clipboard | undefined, Item = (window as Window & { ClipboardItem?: typeof ClipboardItem }).ClipboardItem; if (!clip?.write || !Item) return; try { await clip.write([new Item({ 'image/png': png(r) })]); } catch { /* The in-app clipboard still holds the pixels. */ } }
      function addLayer(raster: Raster, name: string, label: string, x = 0, y = 0) {
        if (!source) return; placeFloating();
        const id = newId(), layer = createRaster(source.width, source.height, [0, 0, 0, 0]); paintRaster(layer, { kind: 'blit', source: raster, x, y, mode: 'replace' });
        const index = source.layers.findIndex(l => l.id === activeId()), stack: { meta: LayerMeta; raster?: Raster }[] = source.layers.map(l => ({ meta: meta(l) }));
        stack.splice(index + 1, 0, { meta: { id, name, visible: true, opacity: 1, blend: 'normal' }, raster: layer }); commitStack(label, stack, id);
      }
      async function paste() {
        let pasted: Raster | null = null;
        try { for (const item of (await window.navigator.clipboard?.read?.()) ?? []) { const type = item.types.find(t => t.startsWith('image/')); if (type) { pasted = await decodeImage(await item.getType(type)); break; } } } catch { /* Permission denied or no image. */ }
        pasted ??= clipboard ? copyRaster(clipboard) : null;
        if (disposed || !source) return;
        if (!pasted) { message = 'Nothing to paste. Copy a selection or an image first.'; refresh(); return; }
        const [x, y] = toDocument({ x: 0, y: 0 }); addLayer(pasted, 'Pasted', 'Paste', Math.max(0, Math.ceil(x)), Math.max(0, Math.ceil(y))); tool = { tool: 'move', drag: null }; host.invalidate();
      }
      async function importImage(asLayer: boolean) {
        const result = await fileAccess({ op: 'open', accept: IMAGE_TYPES }, files);
        if (disposed || 'cancelled' in result) return;
        if (!result.ok) { fail(`${result.error.code}: ${result.error.message}`); return; }
        try {
          const next = await decodeImage(new Blob(result.value.bytes.map(b => b.slice())));
          if (disposed) return;
          if (asLayer && source) { addLayer(next, basename(result.value.name), 'Import as layer'); return; }
          const value = imageContent({ operation: 'layers', previous: null, width: next.width, height: next.height, layers: [{ meta: { id: 'background', name: 'Background', visible: true, opacity: 1, blend: 'normal' }, raster: next }], activeLayerId: 'background' });
          await host.open({ id: crypto.randomUUID(), title: basename(result.value.name), format: 'gsnv-image', version: 1, value });
        } catch (cause) { fail(`This image could not be opened: ${cause instanceof Error ? cause.message : String(cause)}`); }
      }
      async function exportPNG() {
        if (!source || !current) return; placeFloating();
        try {
          const bytes = new Uint8Array(await (await png(flattened())).arrayBuffer()), result = await fileAccess({ op: 'save', name: `${current.title.trim() || 'image'}.png`, mime: 'image/png', bytes }, files);
          if ('cancelled' in result) return; message = result.ok ? `Exported ${result.value.name}.` : `${result.error.code}: ${result.error.message}`; refresh();
        } catch (cause) { fail(cause); }
      }
      function layerAction(action: LayerAction) {
        if (!source || !current) return; placeFloating();
        const list = source.layers, index = list.findIndex(l => l.id === activeId()), stack = () => list.map(l => ({ meta: meta(l) } as { meta: LayerMeta; raster?: Raster; from?: string }));
        if (action.id === 'select') { if (action.layerId !== activeId()) commitStack('Select layer', stack(), action.layerId); return; }
        if (action.id === 'toggle') { commitStack('Layer visibility', list.map(l => ({ meta: l.id === action.layerId ? { ...meta(l), visible: !l.visible } : meta(l) })), activeId()); return; }
        if (action.id === 'rename') {
          const target = list.find(l => l.id === action.layerId)!;
          host.dialog({ title: 'Layer properties', fields: [{ key: 'name', label: 'Name', type: 'text' }], initial: { name: target.name }, validate: v => String(v.name).trim() ? { ok: true, value: v } : { ok: false, error: { code: 'image.layer', message: 'Name the layer.' } }, preview() {}, cancel() {},
            commit(v) { commitStack('Rename layer', list.map(l => ({ meta: l.id === target.id ? { ...meta(l), name: String((v as Record<string, unknown>).name).trim() } : meta(l) })), activeId()); } });
          return;
        }
        if (action.id === 'opacity') { opacityPreview = action.value; composite(); if (action.commit) { opacityPreview = null; commitStack('Layer opacity', list.map(l => ({ meta: l.id === activeId() ? { ...meta(l), opacity: action.value } : meta(l) })), activeId()); } else refresh(); return; }
        if (action.id === 'blend') { commitStack('Blend mode', list.map(l => ({ meta: l.id === activeId() ? { ...meta(l), blend: action.value } : meta(l) })), activeId()); return; }
        if (action.id === 'new') addLayer(createRaster(1, 1, [0, 0, 0, 0]), `Layer ${list.length + 1}`, 'New layer');
        else if (action.id === 'duplicate') { const s = stack(), id = newId(); s.splice(index + 1, 0, { meta: { ...meta(list[index]!), id, name: `${list[index]!.name} copy` }, from: list[index]!.id }); commitStack('Duplicate layer', s, id); }
        else if (action.id === 'delete' && list.length > 1) { const s = stack(); s.splice(index, 1); commitStack('Delete layer', s, s[Math.max(0, index - 1)]!.meta.id); }
        else if ((action.id === 'up' && index < list.length - 1) || (action.id === 'down' && index > 0)) { const s = stack(), j = action.id === 'up' ? index + 1 : index - 1; [s[index], s[j]] = [s[j]!, s[index]!]; commitStack(action.id === 'up' ? 'Move layer up' : 'Move layer down', s, activeId()); }
        else if (action.id === 'mergeDown' && index > 0) {
          const below = list[index - 1]!, top = list[index]!, out = createRaster(source.width, source.height, [0, 0, 0, 0]);
          compositeLayers({ width: out.width, height: out.height, layers: [{ raster: rasters.get(below.id)!, visible: true, opacity: below.opacity, blend: 'normal' }, { raster: rasters.get(top.id)!, visible: top.visible, opacity: top.opacity, blend: top.blend }], rect: fullRect(), out: out.data });
          const s = stack(); s.splice(index - 1, 2, { meta: { ...meta(below), opacity: 1 }, raster: out }); commitStack('Merge down', s, below.id);
        }
      }
      function command(id: string) {
        if (!source || !current) return;
        message = '';
        const toolId = id.startsWith('image.') ? id.slice(6) as ImageTool : null;
        if (toolId && (IMAGE_TOOLS as readonly string[]).includes(toolId)) { if (!['select', 'ellipseSelect', 'lasso', 'move'].includes(toolId)) placeFloating(); if (toolId === 'picker' && tool.tool !== 'picker') previousTool = tool.tool; tool = imageToolInput({ state: tool, event: { kind: 'tool', tool: toolId }, inside: () => false, floating: !!floating }).state; refresh(); return; }
        if (id === 'image.sizeUp' || id === 'image.sizeDown') { options = { ...options, size: Math.min(500, Math.max(1, id === 'image.sizeUp' ? Math.ceil(options.size * 1.2 + 0.5) : Math.floor(options.size / 1.2))) }; refresh(); return; }
        if (id === 'tool.cancel') { pointer({ kind: 'cancel' }); if (floating) { floating = null; resync(); } else { selection = null; selectionChanged(); } refresh(); return; }
        if (id === 'tool.confirm') { placeFloating(); refresh(); return; }
        if (id === 'color.swap') { [primary, secondary] = [secondary, primary]; refresh(); return; }
        if (id === 'color.reset') { primary = BLACK; secondary = WHITE; refresh(); return; }
        if (id === 'view.fit' || id === 'image.actualSize') { fitView(id === 'view.fit' ? 'fit' : 'actual'); refresh(); return; }
        if (id === 'edit.selectAll') { placeFloating(); setSelection(new Uint8Array(source.width * source.height).fill(255), 'replace'); refresh(); return; }
        if (id === 'image.deselect') { placeFloating(); setSelection(null, 'replace'); refresh(); return; }
        if (id === 'image.invertSelection') { placeFloating(); setSelection(selection ? Uint8Array.from(selection.mask, v => 255 - v) : new Uint8Array(source.width * source.height).fill(255), 'replace'); refresh(); return; }
        if (id === 'edit.copy' || id === 'edit.cut') { const pixels = selectedPixels(); if (!pixels) return; clipboard = pixels; void systemCopy(pixels); if (id === 'edit.copy') { message = `Copied ${pixels.width} × ${pixels.height} pixels.`; refresh(); return; } }
        if (id === 'edit.cut' || id === 'edit.delete') {
          if (floating) { floating = null; composite(); commitActive(id === 'edit.cut' ? 'Cut' : 'Delete'); }
          else if (selection) { const raster = active(), base = new Uint8ClampedArray(raster.data); paintRaster(raster, { kind: 'clear', rect: selection.bounds, color: isBottom() ? secondary : [0, 0, 0, 0] }); maskedMerge({ target: raster, base, mask: selection.mask, rect: selection.bounds }); composite(selection.bounds); commitActive(id === 'edit.cut' ? 'Cut' : 'Delete'); }
          refresh(); return;
        }
        if (id === 'edit.paste') { void paste(); return; }
        if (id === 'image.crop') { placeFloating(); if (selection) transformAll({ kind: 'crop', rect: selection.bounds }, 'Crop'); return; }
        if (id === 'image.flatten') { placeFloating(); commitStack('Flatten image', [{ meta: { id: 'background', name: 'Background', visible: true, opacity: 1, blend: 'normal' }, raster: flattened() }], 'background'); return; }
        const transforms: Record<string, [TransformOp, string]> = { 'image.flipH': [{ kind: 'flip', axis: 'horizontal' }, 'Flip horizontal'], 'image.flipV': [{ kind: 'flip', axis: 'vertical' }, 'Flip vertical'], 'image.rotateRight': [{ kind: 'rotate', turns: 1 }, 'Rotate right'], 'image.rotateLeft': [{ kind: 'rotate', turns: 3 }, 'Rotate left'], 'image.rotate180': [{ kind: 'rotate', turns: 2 }, 'Rotate 180°'] };
        if (transforms[id]) { transformAll(...transforms[id]!); return; }
        if (id === 'image.resize' || id === 'image.canvasSize') return sizeDialog(id === 'image.resize' ? 'resize' : 'canvas');
        if (id === 'image.import' || id === 'image.importLayer') { void importImage(id === 'image.importLayer'); return; }
        if (id === 'image.exportPNG') { void exportPNG(); return; }
        if (id.startsWith('layer.')) { layerAction({ id: id.slice(6) } as LayerAction); return; }
        const adjustments: Record<string, () => void> = {
          'adjust.brightnessContrast': () => adjust('Brightness/Contrast', [num('brightness', 'Brightness', -100, 100), num('contrast', 'Contrast', -100, 100)], { brightness: 0, contrast: 0 }, v => ({ kind: 'brightnessContrast', brightness: Number(v.brightness), contrast: Number(v.contrast) })),
          'adjust.hueSaturation': () => adjust('Hue/Saturation', [num('hue', 'Hue', -180, 180), num('saturation', 'Saturation', -100, 100), num('lightness', 'Lightness', -100, 100)], { hue: 0, saturation: 0, lightness: 0 }, v => ({ kind: 'hueSaturation', hue: Number(v.hue), saturation: Number(v.saturation), lightness: Number(v.lightness) })),
          'adjust.levels': () => adjust('Levels', [num('inBlack', 'Input black', 0, 254), num('inWhite', 'Input white', 1, 255), num('gamma', 'Gamma', 0.1, 10, 0.05), num('outBlack', 'Output black', 0, 255), num('outWhite', 'Output white', 0, 255)], { inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255 }, v => ({ kind: 'levels', inBlack: Number(v.inBlack), inWhite: Number(v.inWhite), gamma: Number(v.gamma), outBlack: Number(v.outBlack), outWhite: Number(v.outWhite) })),
          'adjust.curves': () => adjust('Curves', [num('shadows', 'Output at 64', 0, 255), num('midtones', 'Output at 128', 0, 255), num('highlights', 'Output at 192', 0, 255)], { shadows: 64, midtones: 128, highlights: 192 }, v => ({ kind: 'curves', shadows: Number(v.shadows), midtones: Number(v.midtones), highlights: Number(v.highlights) })),
          'adjust.colorBalance': () => adjust('Colour balance', [num('cyanRed', 'Cyan ↔ Red', -100, 100), num('magentaGreen', 'Magenta ↔ Green', -100, 100), num('yellowBlue', 'Yellow ↔ Blue', -100, 100)], { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 }, v => ({ kind: 'colorBalance', cyanRed: Number(v.cyanRed), magentaGreen: Number(v.magentaGreen), yellowBlue: Number(v.yellowBlue) })),
          'adjust.posterize': () => adjust('Posterize', [num('levels', 'Levels', 2, 64)], { levels: 4 }, v => ({ kind: 'posterize', levels: Number(v.levels) })),
          'adjust.threshold': () => adjust('Threshold', [num('level', 'Level', 0, 255)], { level: 128 }, v => ({ kind: 'threshold', level: Number(v.level) })),
          'adjust.desaturate': () => adjust('Desaturate', [], {}, () => ({ kind: 'desaturate' })), 'adjust.invert': () => adjust('Invert colours', [], {}, () => ({ kind: 'invert' })), 'adjust.sepia': () => adjust('Sepia', [], {}, () => ({ kind: 'sepia' })),
          'filter.gaussianBlur': () => adjust('Gaussian blur', [num('radius', 'Radius (px)', 0.5, 100, 0.5)], { radius: 3 }, v => ({ kind: 'gaussianBlur', radius: Number(v.radius) })),
          'filter.unsharpMask': () => adjust('Unsharp mask', [num('amount', 'Amount (%)', 0, 500), num('radius', 'Radius (px)', 0.5, 50, 0.5), num('threshold', 'Threshold', 0, 255)], { amount: 80, radius: 2, threshold: 0 }, v => ({ kind: 'unsharpMask', amount: Number(v.amount), radius: Number(v.radius), threshold: Number(v.threshold) })),
          'filter.addNoise': () => adjust('Add noise', [num('amount', 'Amount', 0, 100), { key: 'monochrome', label: 'Monochrome', type: 'checkbox' }], { amount: 15, monochrome: true }, v => ({ kind: 'addNoise', amount: Number(v.amount), monochrome: !!v.monochrome, seed: 7 })),
          'filter.pixelate': () => adjust('Pixelate', [num('size', 'Cell size (px)', 2, 256)], { size: 8 }, v => ({ kind: 'pixelate', size: Number(v.size) })),
          'filter.findEdges': () => adjust('Find edges', [], {}, () => ({ kind: 'findEdges' })), 'filter.emboss': () => adjust('Emboss', [], {}, () => ({ kind: 'emboss' })),
        };
        adjustments[id]?.();
      }
      /** Shows the whole image (or 100% pixels) centred, whatever the shell zoom and pan are. */
      function fitView(mode: 'fit' | 'actual') {
        if (!source) return; const w = stage.clientWidth || 800, h = stage.clientHeight || 600;
        const effective = mode === 'actual' ? 1 : Math.min((w - 2 * MARGIN) / source.width, (h - 2 * MARGIN) / source.height, 1);
        scale = Math.max(effective, 0.01) / view.zoom; offset = { x: 0, y: 0 };
        const o = origin(); offset = { x: (Math.max(MARGIN, (w - source.width * scale * view.zoom) / 2) - view.pan.x) / view.zoom - o.x, y: (Math.max(MARGIN, (h - source.height * scale * view.zoom) / 2) - view.pan.y) / view.zoom - o.y };
      }
      const Resize = window.ResizeObserver, observer = Resize ? new Resize(() => layout()) : null; observer?.observe(stage);
      return {
        render(snapshot, nextView) {
          const changed = snapshot?.identity !== current?.identity, opened = snapshot?.id !== current?.id; current = snapshot; view = nextView;
          if (changed) { shapeBase = null; shapeDirty = null; marquee = null; tool = { ...tool, drag: null }; if (stroke?.timer) window.clearInterval(stroke.timer); stroke = null; opacityPreview = null; }
          if (!snapshot) { source = null; rasters.clear(); floating = null; selection = null; edges = null; }
          // Undo, redo, open and rejected commits all arrive as a value this view did not produce.
          else if (snapshot.value !== source) {
            const next = snapshot.value as ImageContent, sameSize = !!source && source.width === next.width && source.height === next.height;
            floating = null; if (!sameSize) selection = null; resync();
          }
          if (opened && source) { selection = null; selectionChanged(); message = ''; fitView('fit'); }
          refresh();
        },
        model() {
          const enabled = !!current, has = enabled && (!!selection || !!floating);
          const item = (id: string, label: string, icon?: string, shortcut = '', toolbar = false, on = enabled) => ({ id, label, shortcut, enabled: on, ...(icon ? { icon } : {}), ...(toolbar ? { toolbar } : {}) });
          const index = source?.layers.findIndex(l => l.id === activeId()) ?? -1, count = source?.layers.length ?? 0;
          return {
            menus: [
              { id: 'select', label: 'Select', items: [item('edit.selectAll', 'Select all', 'select', 'Ctrl+A'), item('image.deselect', 'Deselect', undefined, '', false, has), item('image.invertSelection', 'Invert selection'), item('edit.copy', 'Copy', 'copy', 'Ctrl+C', false, has), item('edit.cut', 'Cut', 'cut', 'Ctrl+X', false, has), item('edit.paste', 'Paste as new layer', 'paste', 'Ctrl+V'), item('edit.delete', 'Delete', 'delete', 'Delete', false, has), item('image.crop', 'Crop to selection', 'crop', '', true, has)] },
              { id: 'image', label: 'Image', items: [item('image.import', 'Open image…', 'open'), item('image.importLayer', 'Import as layer…', 'layerAdd'), item('image.exportPNG', 'Export PNG…', 'export', '', true), item('image.resize', 'Resize…', 'fit'), item('image.canvasSize', 'Canvas size…', 'grid'),
                item('image.rotateRight', 'Rotate right', 'rotate', '', true), item('image.rotateLeft', 'Rotate left', 'rotate'), item('image.rotate180', 'Rotate 180°', 'rotate'), item('image.flipH', 'Flip horizontal', 'flip', '', true), item('image.flipV', 'Flip vertical', 'flip'),
                item('image.flatten', 'Flatten image', 'layers', '', false, enabled && count > 1), item('view.fit', 'Zoom to fit', 'fit', 'F'), item('image.actualSize', 'Actual pixels', 'zoomIn'), item('color.swap', 'Swap colours', undefined, 'X'), item('color.reset', 'Default colours', undefined, 'D')] },
              { id: 'layer', label: 'Layer', items: [item('layer.new', 'New layer', 'layerAdd', '', true), item('layer.duplicate', 'Duplicate layer', 'copy'), item('layer.delete', 'Delete layer', 'delete', '', false, enabled && count > 1), item('layer.up', 'Move up', undefined, '', false, enabled && index < count - 1), item('layer.down', 'Move down', undefined, '', false, enabled && index > 0), item('layer.mergeDown', 'Merge down', 'layers', '', false, enabled && index > 0)] },
              { id: 'adjust', label: 'Adjustments', items: [item('adjust.brightnessContrast', 'Brightness/Contrast…'), item('adjust.hueSaturation', 'Hue/Saturation…'), item('adjust.levels', 'Levels…'), item('adjust.curves', 'Curves…'), item('adjust.colorBalance', 'Colour balance…'), item('adjust.desaturate', 'Desaturate'), item('adjust.invert', 'Invert colours'), item('adjust.sepia', 'Sepia'), item('adjust.posterize', 'Posterize…'), item('adjust.threshold', 'Threshold…')] },
              { id: 'filter', label: 'Filters', items: [item('filter.gaussianBlur', 'Gaussian blur…'), item('filter.unsharpMask', 'Unsharp mask…'), item('filter.addNoise', 'Add noise…'), item('filter.pixelate', 'Pixelate…'), item('filter.findEdges', 'Find edges'), item('filter.emboss', 'Emboss')] },
            ],
            tools: IMAGE_TOOLS.map(id => ({ id: `image.${id}`, label: TOOLS[id].label, icon: TOOLS[id].icon, shortcut: TOOLS[id].key, enabled, status: TOOLS[id].hint, active: enabled && tool.tool === id })),
            panels: [{ id: 'image-options', title: 'Colours and tool options', content: optionsPanel }, { id: 'image-layers', title: 'Layers', content: layersPanel }],
          };
        },
        context: () => ({ viewRole: 'canvas2d', activeTool: tool.tool, status: hint.textContent ?? '' }),
        command(id) { try { command(id); } catch (cause) { fail(cause); } host.invalidate(); },
        gesture(gesture) {
          if (!source || gesture.type !== 'pointer') return;
          if (gesture.button === 1 || panning) {
            if (gesture.phase === 'down' && gesture.button === 1) { panning = { ...gesture.point }; stage.dataset.panning = 'true'; }
            else if (panning && gesture.phase === 'move') { offset = { x: offset.x + (gesture.point.x - panning.x) / view.zoom, y: offset.y + (gesture.point.y - panning.y) / view.zoom }; panning = { ...gesture.point }; layout(); }
            else if (gesture.phase === 'up' || gesture.phase === 'cancel') { panning = null; delete stage.dataset.panning; }
            return;
          }
          try {
            const point = toDocument(gesture.point); cursor = point;
            if (gesture.phase === 'cancel') { pointer({ kind: 'cancel' }); ring.hidden = true; }
            else pointer({ kind: gesture.phase, point, button: gesture.button, shift: gesture.shift, ctrl: gesture.ctrl });
          } catch (cause) { fail(cause); }
          if (gesture.phase !== 'move') host.invalidate();
        },
        dispose() { if (disposed) return; disposed = true; window.clearInterval(antTimer); if (stroke?.timer) window.clearInterval(stroke.timer); observer?.disconnect(); palette.dispose(); layers.dispose(); host.root.replaceChildren(); },
      };
    },
  };
}
