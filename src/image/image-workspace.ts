/**
 * PURPOSE    Connect the layered Paint/Photoshop-style Image editor to the shared application.
 * KIND       SHELL assembly IMAGE-APP; routing, lifecycle, canvas display and browser I/O only.
 * CONTRACT   IN: S07 file ports and browser DOM/Canvas. OUT: WorkspaceAdapter for gsnv-image.
 *            Pixel decisions belong to raster-ops, image-brush, image-adjust and image-composite; gestures to
 *            image-tool-input; snapshots to image-content. Each completed stroke, shape, fill, gradient, text,
 *            move, selection, adjustment, filter or layer change commits one history entry; drags, adjustment previews
 *            and floating moves stay outside history. Painting is clipped to the selection mask.
 *            RAISES: invalid project content from decode; operational failures show in the hint.
 * GUARANTEES Saved files contain committed layers and selection; undo/redo/open/recovery restore both.
 *            Typed zoom uses effective pixel scale at viewport center; Cancel restores the prior view.
 * TUNING     NEW_SIZE, MARGIN, PASTE_FIT, SPRAY_INTERVAL_MS and text defaults below.
 * DECISIONS  D1: One working raster per layer, mutated during a drag from a per-stroke base copy, committed
 *            as shared tiles. D2: A moved selection floats until placed (click outside, Enter, tool change);
 *            Esc cancels. D3: Paste creates a new layer, as in Photoshop and GIMP.
 * LIMITS     No layer masks, groups or editable text. Image import/export uses browser codecs.
 * TESTBENCH  src/image/image-workspace.browser.spec.ts -- run with: npm run test:browser -- src/image/image-workspace.browser.spec.ts
 */
import type { WorkspaceAdapter } from '../app/app-shell.ts';
import { imageSourceAdapter } from '../bridge/image-source-adapter.ts';
import { viewTransform, type View2D } from '../shared/view-transform.ts';
import { fontLibrary, MAX_FONT_BYTES } from '../shared/font-library.ts';
import type { DialogSpec } from '../shared/dialog.ts';
import { fileAccess, type FilePorts } from '../shared/file-access.ts';
import { imageContent, type ImageContent, type LayerMeta } from './image-content.ts';
import { transformRaster, affineRaster, type TransformOp } from './raster-transform.ts';
import { paintRaster, clip, createRaster, MAX_PIXELS, type Raster, type RGBA, type Rect } from './raster-ops.ts';
import { imageToolInput, IMAGE_TOOLS, type ImageTool, type ImageToolState, type SelectMode } from './image-tool-input.ts';
import { imagePalette, DEFAULT_OPTIONS, type ToolOptions } from './image-palette.ts';
import { imageLayersPanel, type LayerAction } from './image-layers-panel.ts';
import { compositeLayers, maskedMerge, type CompositeLayer } from './image-composite.ts';
import { dabLine, dab, spray, smudgeDab, applyCoverage, gradientFill, shapeMask, magicWand, combineMasks, maskBounds, type Coverage, type CoverageMode, type SmudgeCarry } from './image-brush.ts';
import { adjustRaster, blurRaster, type AdjustOp } from './image-adjust.ts';
import { imageTransformView } from './image-transform-view.ts';
import type { TransformBox } from './image-transform.ts';
import { imageNavigator } from './image-navigator.ts';
import { pixelCoverage, type PixelPolicy } from './image-pixel-policy.ts';
import { imageOutput } from './image-output.ts';
import { imageNewDialog, imagePolicyDialog } from './image-settings.ts';
import { createImageAutomation } from './image-automation.ts';
import { applyImageOperation } from './image-operations.ts';
import type { ImageOperation, ImageRecipeAsset } from './image-operation-types.ts';
import { paintPolicyShape } from './image-policy-drawing.ts';
import { imageBatchDialog } from './image-batch-dialog.ts';
import { createImageReplay } from './image-replay-client.ts';
import { nativeContainer } from '../shared/native-container.ts';
import { mergedImage } from './image-operations-pixels.ts';
import type { ImageRecipe } from './image-operation-types.ts';
import type { BatchFilePorts } from './image-batch-files.ts';
import { imageDownpixelDialog } from './image-downpixel-dialog.ts';
import { createImageEffects } from './image-effects-client.ts';
import { pixelStroke } from './pixel-stroke.ts';
import './image-workspace.css';

type Snapshot = Parameters<ReturnType<WorkspaceAdapter['mount']>['render']>[0];
type Selection = { mask: Uint8Array; bounds: Rect };
type Floating = { raster: Raster; x: number; y: number; origin: { x: number; y: number }; label: string; asset?:ImageRecipeAsset; fromClipboard?:boolean };
type Stroke = { base: Uint8ClampedArray; cov: Coverage; carry: number; mode: CoverageMode | 'pencil' | 'smudge'; dirty: Rect | null; timer: number | null; last: [number, number]; seed: number; operation:Extract<ImageOperation,{kind:'stroke'}>; segments:{points:[number,number][];seed:number}[] };
const NEW_SIZE = { width: 800, height: 600 }, MARGIN = 24, PASTE_FIT = 0.8, SPRAY_INTERVAL_MS = 40;
const BLACK: RGBA = [0, 0, 0, 255], WHITE: RGBA = [255, 255, 255, 255];
const IMAGE_TYPES = { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/gif': ['.gif'], 'image/webp': ['.webp'], 'image/bmp': ['.bmp'] };
const TOOLS: Record<ImageTool, { label: string; icon: string; key: string; hint: string }> = {
  move: { label: 'Move', icon: 'paintMove', key: 'V', hint: 'Drag to move the selection, or the whole layer when nothing is selected · Enter places it.' },
  select: { label: 'Rectangle select', icon: 'paintSelect', key: 'S', hint: 'Drag to select · Shift adds, Ctrl subtracts · drag inside to move the pixels.' },
  ellipseSelect: { label: 'Ellipse select', icon: 'paintEllipseSelect', key: 'M', hint: 'Drag to select an ellipse · Shift adds, Ctrl subtracts.' },
  lasso: { label: 'Lasso', icon: 'paintLasso', key: 'Q', hint: 'Drag around an area to select it freehand · Shift adds, Ctrl subtracts.' },
  wand: { label: 'Magic wand', icon: 'paintWand', key: 'W', hint: 'Click to select similar colours · Tolerance and Contiguous are in Tool options.' },
  pencil: { label: 'Pencil', icon: 'paintPencil', key: 'P', hint: 'Hard-edged pixels · left button: primary colour · right: secondary.' },
  brush: { label: 'Brush', icon: 'paintBrush', key: 'B', hint: 'Hard pixels by default · Pixel size makes larger blocks · choose Smooth for soft edges · [ ] change size.' },
  airbrush: { label: 'Airbrush', icon: 'paintAirbrush', key: 'A', hint: 'Sprays while you hold the button · Density sets how fast paint builds up.' },
  eraser: { label: 'Eraser', icon: 'paintEraser', key: 'E', hint: 'Erases to transparency (to the secondary colour on the bottom layer).' },
  clone: { label: 'Clone stamp', icon: 'paintClone', key: 'C', hint: 'Ctrl-click to choose the source, then paint to copy from it.' },
  blur: { label: 'Blur brush', icon: 'paintBlur', key: 'U', hint: 'Paint to soften detail.' },
  smudge: { label: 'Smudge', icon: 'paintSmudge', key: 'K', hint: 'Drag to push colour along the stroke · Strength sets how far it carries.' },
  fill: { label: 'Fill', icon: 'paintFill', key: 'G', hint: 'Click to fill similar colours · Tolerance and Contiguous are in Tool options.' },
  gradient: { label: 'Gradient', icon: 'paintGradient', key: 'N', hint: 'Drag to draw a gradient from the primary colour · Shift snaps to 45°.' },
  picker: { label: 'Pick colour', icon: 'paintPicker', key: 'I', hint: 'Click to pick the primary colour · right-click picks the secondary colour.' },
  text: { label: 'Text', icon: 'paintText', key: 'T', hint: 'Click where the text should start.' },
  line: { label: 'Line', icon: 'paintLine', key: 'L', hint: 'Drag to draw a line · Shift snaps to 45°.' },
  rectangle: { label: 'Rectangle', icon: 'paintRectangle', key: 'R', hint: 'Drag to draw a rectangle · Shift draws a square.' },
  ellipse: { label: 'Ellipse', icon: 'paintEllipse', key: 'O', hint: 'Drag to draw an ellipse · Shift draws a circle.' },
};
const copyRaster = (r: Raster): Raster => ({ width: r.width, height: r.height, data: new Uint8ClampedArray(r.data) });
const basename = (name: string) => name.replace(/\.[^.]+$/, '') || 'Untitled image';
const union = (a: Rect | null, b: Rect | null): Rect | null => !a ? b : !b ? a : { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x), height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y) };
const meta = (l: LayerMeta): LayerMeta => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend });
const newId = () => `layer-${crypto.randomUUID().slice(0, 8)}`;

export function createImageWorkspace(files: FilePorts): WorkspaceAdapter {
  let starterValue:ImageContent|null=null;
  return {
    createOnStartup: true,
    create: () => ({ id: crypto.randomUUID(), title: 'Untitled image', format: 'gsnv-image', version: 1, value: (starterValue=imageContent({ operation: 'new', ...NEW_SIZE, fill: WHITE })) }),
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
      let fontStorage: IDBFactory | undefined; try { fontStorage = window.indexedDB; } catch { /* Session-only fonts still work. */ }
      const fonts = fontLibrary({ fonts: document.fonts, FontFace: window.FontFace, crypto: window.crypto, storage: fontStorage });
      const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string) => { const node = document.createElement(tag); node.className = className; return node; };
      const stage = make('div', 'image-stage'), surface = make('div', 'image-surface'), canvas = make('canvas', 'image-canvas'), float = make('canvas', 'image-floating'), overlay = make('canvas', 'image-overlay');
      const ring = make('div', 'image-brush-ring'), hint = make('div', 'image-tool-hint'), notice = make('div', 'image-empty'), optionsPanel = document.createElement('div'), layersPanel = document.createElement('div');
      stage.tabIndex = -1; canvas.setAttribute('aria-label', 'Image canvas'); notice.textContent = 'Choose New (Ctrl+N), Open (Ctrl+O), or Paste (Ctrl+V) an image from your clipboard.';
      surface.append(canvas, float, overlay); stage.append(surface, ring, notice); host.root.append(stage, hint);
      const context = canvas.getContext('2d'), floatContext = float.getContext('2d'), overlayContext = overlay.getContext('2d');
      let current: Snapshot, source: ImageContent | null = null, rasters = new Map<string, Raster>(), display: ImageData | null = null, view: View2D = { zoom: 1, pan: { x: 0, y: 0 } };
      let tool: ImageToolState = { tool: 'brush', drag: null }, previousTool: ImageTool = 'brush', primary = BLACK, secondary = WHITE, options: ToolOptions = { ...DEFAULT_OPTIONS };
      let selection: Selection | null = null, floating: Floating | null = null, stroke: Stroke | null = null, shapeBase: Uint8ClampedArray | null = null, shapeDirty: Rect | null = null;
      let smudge: SmudgeCarry | null = null, cloneSource: [number, number] | null = null, opacityPreview: number | null = null, edges: Int32Array | null = null, phase = 0;
      let scale = 1, offset = { x: 0, y: 0 }, panning: { x: number; y: number } | null = null, cursor: [number, number] | null = null, message = '', disposed = false, marquee: { shape: string; points: [number, number][] } | null = null;
      let pendingImages = 0, rasterRevision = 0;
      let policyPreview: PixelPolicy | null = null;
      const effects = createImageEffects(); let effectRevision = 0, effectBusy = false, effectQueued = false;
      let renderedPixels: Uint8ClampedArray | null = null;
      let floatCache: { original: Raster; key: string; result: Raster } | null = null;
      let canvasRendering: 'pixels' | 'smooth' = 'pixels', sampling: 'nearest' | 'bilinear' = 'nearest';
      const sharpRendering = window.CSS.supports('image-rendering', 'crisp-edges') ? 'crisp-edges' : 'pixelated';
      let transform: { box: TransformBox; original: Raster } | null = null;
      const pendingTransfer = () => disposed ? 'closed workspace' : floating ? 'floating selection' : stroke ? 'brush stroke' : shapeBase ? 'shape' : marquee || tool.drag ? 'selection or tool gesture' : opacityPreview !== null ? 'opacity preview' : pendingImages ? 'image import or paste' : '';
      const bridge = imageSourceAdapter({ read: () => current ? { ...current, value: current.value as ImageContent } : undefined, pending: pendingTransfer });
      const palette = imagePalette({ root: optionsPanel, onChange(change) {
        if (change.kind === 'primary') primary = change.color; else if (change.kind === 'secondary') secondary = change.color;
        else if (change.kind === 'swap') [primary, secondary] = [secondary, primary]; else if (change.kind === 'option') options = { ...options, [change.key]: change.value };
        refresh();
      } });
      const layers = imageLayersPanel({ root: layersPanel, onAction: layerAction });
      const antTimer = window.setInterval(() => { if (edges && !disposed) { phase = (phase + 1) % 8; drawOverlay(); } }, 160);

      const automation=createImageAutomation({root:host.root,files,read:()=>current?.value as ImageContent??null,
        commit(value,label){commitOperation(value,label,null);},preview(value){resync(value??undefined);refresh();},dialog:host.dialog,notice(text){message=text;refresh();},invalidate:host.invalidate,
        flush(){finishStroke();placeFloating();},batch(recipe){batchProcess(recipe);}});
      function commitOperation(value:ImageContent,label:string,operation:ImageOperation|null,assets:readonly ImageRecipeAsset[]=[]){
        if(!current)return;const before=current.value as ImageContent;
        automation.observe(before,value,label,operation?[{operation,reference:{width:before.width,height:before.height},assets}]:null);
        if(value!==before){
          const sameSize=source?.width===value.width&&source?.height===value.height;
          const unchangedPreview=operation&&['stroke','shape','fill','gradient','adjust'].includes(operation.kind);
          // Lifting clears the working raster; even an identity transform must restore it.
          const lifted=operation?.kind==='affine'||operation?.kind==='move';
          rasters=new Map(value.layers.map(layer=>{const old=before.layers.find(l=>l.id===layer.id),working=rasters.get(layer.id);return[layer.id,sameSize&&working&&(unchangedPreview&&layer.id===value.activeLayerId||(!lifted||layer.id!==value.activeLayerId)&&old?.tiles.length===layer.tiles.length&&old.tiles.every((tile,i)=>tile===layer.tiles[i]))?working:imageContent({operation:'raster',value,layerId:layer.id})];}));
          if(before.policy.mode!==value.policy.mode)sampling=value.policy.mode==='pixel-art'?'nearest':'bilinear';
          source=value;selection=value.selection;if(!sameSize){for(const c of [canvas,overlay]){c.width=value.width;c.height=value.height;}display=new ImageData(value.width,value.height);}
          if(!unchangedPreview||value.policy.palette)composite();selectionChanged();host.commit({...current,value},label,current.identity);
        }
      }
      function perform(operation:ImageOperation,label:string,assets:readonly ImageRecipeAsset[]=[]){
        if(!current)return;try{const result=applyImageOperation({image:current.value as ImageContent,clipboard},operation,assets);clipboard=result.clipboard;const changed=result.image!==current.value;commitOperation(result.image,label,operation,assets);if(!changed)refresh();}
        catch(cause){resync();fail(cause);}
      }
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
      function applyView(next: View2D) {
        scale = next.zoom / view.zoom; offset = { x: 0, y: 0 }; const o = origin();
        offset = { x: (next.pan.x - view.pan.x) / view.zoom - o.x, y: (next.pan.y - view.pan.y) / view.zoom - o.y }; refresh();
      }
      const navigator = imageNavigator({ root: host.root,
        onZoom(zoom) { const t = placement(); applyView(viewTransform({ view: { zoom: t.z, pan: { x: t.x, y: t.y } }, range: { min: .01, max: 64 }, action: { type: 'zoom', factor: zoom / t.z, cursor: { x: stage.clientWidth / 2, y: stage.clientHeight / 2 } } })); },
        onCenter(point) { const t = placement(); applyView({ zoom: t.z, pan: { x: stage.clientWidth / 2 - point.x * t.z, y: stage.clientHeight / 2 - point.y * t.z } }); },
        onFit() { fitView('fit'); refresh(); },
      });

      const transformView = imageTransformView({ root: stage,
        onBegin: freeTransform,
        onChange(box) { if (!transform) return; transform.box = box; message = ''; layout(); },
        onApply() { placeFloating(); message = ''; refresh(); stage.focus(); host.invalidate(); },
        onCancel() { transform = null; floating = null; resync(); message = ''; refresh(); stage.focus(); host.invalidate(); },
        onSampling(value) { sampling = value; layout(); },
        onError: fail,
      });
      function composite(rect: Rect | null = null) {
        if (!source || !context || !display) return;
        const r = clip(rect ?? fullRect(), source); if (!r.width || !r.height) return;
        const stack: CompositeLayer[] = source.layers.map(l => ({ raster: rasters.get(l.id)!, visible: l.visible, opacity: l.id === activeId() && opacityPreview !== null ? opacityPreview : l.opacity, blend: l.blend }));
        compositeLayers({ width: source.width, height: source.height, layers: stack, rect: r, out: display.data });
        const policy = policyPreview ?? source.policy;
        effectRevision++;
        if (policy.palette) {
          if(source.width*source.height<=65536){effects.cancel(); effectQueued=false; const output=imageOutput({width:source.width,height:source.height,data:display.data},policy); renderedPixels=output.data;context.putImageData(new ImageData(new Uint8ClampedArray(output.data),source.width,source.height),0,0);}
          else { effectQueued=true; void renderPalette(); }
        } else { effects.cancel(); effectQueued=false; renderedPixels=display.data; context.putImageData(display,0,0,r.x,r.y,r.width,r.height); } rasterRevision++;
      }
      async function renderPalette() {
        if(effectBusy||!effectQueued||disposed||!source||!display)return;
        const policy=policyPreview??source.policy;if(!policy.palette)return;
        effectQueued=false;effectBusy=true;const generation=source;
        try{const out=await effects.run({kind:'quantize',raster:{width:source.width,height:source.height,data:display.data},palette:policy.palette});
          if(!disposed&&source===generation&&(policyPreview??source.policy)===policy){renderedPixels=out.data;context?.putImageData(new ImageData(new Uint8ClampedArray(out.data),out.width,out.height),0,0);rasterRevision++;layout();}}
        catch(cause){if(!(cause instanceof DOMException&&cause.name==='AbortError'))fail(cause);}
        finally{effectBusy=false;if(effectQueued)void renderPalette();}
      }
      function resync(preview?: ImageContent) {
        transform = null;
        if (!current) return; const next = preview ?? current.value as ImageContent;
        if (!source || source.policy.mode !== next.policy.mode) { canvasRendering = next.policy.mode === 'pixel-art' ? 'pixels' : 'smooth'; sampling = next.policy.mode === 'pixel-art' ? 'nearest' : 'bilinear'; }
        source = next;
        selection = source.selection;
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
        navigator.update(source ? { image: canvas, revision: rasterRevision, view: { x: t.x, y: t.y, zoom: z }, viewport: { width: stage.clientWidth, height: stage.clientHeight } } : null);
        surface.style.transform = `translate(${t.x}px,${t.y}px) scale(${z})`;
        surface.style.width = `${source?.width ?? 0}px`; surface.style.height = `${source?.height ?? 0}px`; surface.dataset.zoom = z >= 1 ? 'pixels' : 'smooth'; surface.dataset.rendering = canvasRendering;
        const bounds = transform?.box ?? (floating ? { x: floating.x, y: floating.y, width: floating.raster.width, height: floating.raster.height, angle: 0 } : selection && ['move', 'select', 'ellipseSelect', 'lasso', 'wand'].includes(tool.tool) && !tool.drag ? { ...selection.bounds, angle: 0 } : null);
        transformView.update(bounds && source ? { box: bounds, active: !!transform, sampling, view: { x: t.x, y: t.y, zoom: z } } : null);
        float.style.imageRendering = transform ? (sampling === 'nearest' ? sharpRendering : 'auto') : '';
        if (floating) {
          float.hidden = false;
          if (transform) { const b = transform.box, original = transform.original, key=JSON.stringify([b.width,b.height,b.angle,sampling,source?.policy]); if(!floatCache||floatCache.original!==original||floatCache.key!==key)floatCache={original,key,result:imageOutput(affineRaster(original,{scaleX:b.width/original.width*100,scaleY:b.height/original.height*100,angle:b.angle,sampling}),source!.policy)}; const r=floatCache.result; float.width=r.width;float.height=r.height;floatContext?.putImageData(new ImageData(new Uint8ClampedArray(r.data),r.width,r.height),0,0);float.style.left=`${Math.round(b.x+b.width/2-r.width/2)}px`;float.style.top=`${Math.round(b.y+b.height/2-r.height/2)}px`;float.style.transform=''; }
          else { float.style.left = `${floating.x}px`; float.style.top = `${floating.y}px`; float.style.transform = ''; }
        } else { float.style.transform = ''; if (!document.querySelector('dialog[open]')) float.hidden = true; }
      }
      const thumbnailsByLayer=new Map<string,{tiles:ImageContent['layers'][number]['tiles'];width:number;height:number;canvas:HTMLCanvasElement}>();
      function thumbnails() {
        const map = new Map<string, HTMLCanvasElement>(); if (!source) return map;
        for(const id of thumbnailsByLayer.keys())if(!source.layers.some(l=>l.id===id))thumbnailsByLayer.delete(id);
        for (const l of source.layers) {
          const cached=thumbnailsByLayer.get(l.id);if(cached&&cached.width===source.width&&cached.height===source.height&&cached.tiles.length===l.tiles.length&&cached.tiles.every((tile,i)=>tile===l.tiles[i])){map.set(l.id,cached.canvas);continue;}
          const t = document.createElement('canvas'); t.className = 'image-layer-thumb'; t.width = 32; t.height = Math.max(8, Math.min(32, Math.round(32 * source.height / source.width)));
          const raster = rasters.get(l.id), ctx = t.getContext('2d');
          if (raster && ctx) { const tmp = document.createElement('canvas'); tmp.width = raster.width; tmp.height = raster.height; tmp.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height), 0, 0); ctx.drawImage(tmp, 0, 0, t.width, t.height); }
          map.set(l.id, t);thumbnailsByLayer.set(l.id,{tiles:l.tiles,width:source.width,height:source.height,canvas:t});
        }
        return map;
      }
      let thumbsFor: ImageContent | null = null, thumbCache = new Map<string, HTMLCanvasElement>();
      function refresh() {
        if (disposed) return;
        notice.hidden = !!current; surface.hidden = !current; layout(); stage.dataset.tool = tool.tool;
        hint.textContent = message || automation.status() || (current ? TOOLS[tool.tool].hint : 'New (Ctrl+N) starts an image.');
        const parts = source ? [`${source.width} × ${source.height} px`, `${Math.round(view.zoom * scale * 100)}%`] : [];
        if (cursor && source) parts.push(`${Math.floor(cursor[0])}, ${Math.floor(cursor[1])}`);
        const s = floating ? { width: floating.raster.width, height: floating.raster.height } : selection?.bounds; if (s) parts.push(`selection ${s.width} × ${s.height}`);
        palette.update({ primary, secondary, tool: tool.tool, options, info: parts.join(' · '), enabled: !!current });
        if (source !== thumbsFor) { thumbsFor = source; thumbCache = thumbnails(); }
        layers.update({ layers: source?.layers.map(l => l.id === activeId() && opacityPreview !== null ? { ...meta(l), opacity: opacityPreview } : meta(l)) ?? [], activeLayerId: activeId(), thumbnails: thumbCache, enabled: !!current });
        if (current && document.activeElement === document.body && !document.querySelector('dialog[open]')) stage.focus();
      }
      function placeFloating() {
        if(!floating||!source)return;const f=floating,b=transform?.box,original=source.selection?.bounds??fullRect();
        const operation:ImageOperation=b?{kind:'affine',box:{...b},sampling,background:secondary,...(f.fromClipboard?{clipboard:true as const}:f.asset?{asset:f.asset.id}:{})}:{kind:'move',dx:f.x-original.x,dy:f.y-original.y,background:secondary};
        transform=null;floating=null;perform(operation,b?'Transform':f.label,f.asset?[f.asset]:[]);
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
        const changed = !!stroke.dirty,operation=stroke.operation; stroke = null; if (changed) perform(operation,TOOLS[tool.tool].label);
      }
      function strokeApply(rect: Rect | null) {
        if (!stroke || !rect || !source) return; const raster = active();
        if (stroke.mode !== 'pencil' && stroke.mode !== 'smudge') applyCoverage({ raster, base: stroke.base, cov: stroke.cov, rect, mode: stroke.mode, opacity: stroke.operation.options.opacity });
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
          const segments:{points:[number,number][];seed:number}[]=[];const operation:Extract<ImageOperation,{kind:'stroke'}>={kind:'stroke',tool:t as Extract<ImageOperation,{kind:'stroke'}>['tool'],segments,options:{size:options.size,pixelSize:options.pixelSize,edge:options.edge,hardness:options.hardness/100,opacity:options.opacity/100,flow:options.flow/100,strength:options.strength/100,density:options.density},color:fore,background:back,cloneOffset:t==='clone'?[Math.round(cloneSource![0]-points[0]![0]),Math.round(cloneSource![1]-points[0]![1])]:null};
          stroke = { operation,segments,base, cov: { width: raster.width, height: raster.height, data: new Float32Array(raster.width * raster.height) }, carry: 0, mode, dirty: null, timer: null, last: points[0]!, seed: Date.now() & 0xffff };
          if (t === 'airbrush') stroke.timer = window.setInterval(() => { if (stroke) {const seed=++stroke.seed;stroke.segments.push({points:[[...stroke.last]],seed});strokeApply(spray(stroke.cov, stroke.last[0], stroke.last[1], stroke.operation.options.size / 2, Math.ceil(stroke.operation.options.density / 4), seed));} }, SPRAY_INTERVAL_MS);
        }
        if (!stroke) return;
        const s = stroke, opts=s.operation.options, last = points[points.length - 1]!; s.last = last;if(t!=='airbrush')s.segments.push({points:points.map(p=>[...p]),seed:s.seed});
        if (s.mode === 'pencil') {
          const rect = pixelStroke({ cov: s.cov, points, size: opts.size, pixelSize: opts.pixelSize, tip: 'square' });
          if (rect) applyCoverage({ raster, base: s.base, cov: s.cov, rect, mode: { kind: 'paint', color: s.operation.color }, opacity: 1 });
          strokeApply(rect); return;
        }
        if (['brush', 'eraser'].includes(t) && opts.edge === 'pixel') { strokeApply(pixelStroke({ cov: s.cov, points, size: opts.size, pixelSize: opts.pixelSize, tip: 'round' })); return; }
        if (s.mode === 'smudge') {
          const from = points[0]!, length = Math.hypot(last[0] - from[0], last[1] - from[1]), step = Math.max(1, opts.size * 0.1); let rect: Rect | null = null;
          if (!smudge) smudge = smudgeDab(raster, null, from, opts.size, opts.hardness, opts.strength).carry;
          for (let d = step; d <= length + 0.001; d += step) { const r = smudgeDab(raster, smudge, [from[0] + (last[0] - from[0]) * d / length, from[1] + (last[1] - from[1]) * d / length], opts.size, opts.hardness, opts.strength); smudge = r.carry; rect = union(rect, r.rect); }
          strokeApply(rect); return;
        }
        if (t === 'airbrush') { const seed=++s.seed;s.segments.push({points:points.map(p=>[...p]),seed});strokeApply(spray(s.cov, last[0], last[1], opts.size / 2, Math.ceil(opts.density / 4), seed)); return; }
        const hardness = opts.hardness, flow = t === 'brush' ? opts.flow : 1;
        if (points.length === 1) strokeApply(dab(s.cov, last[0], last[1], opts.size, hardness, flow));
        else { const r = dabLine(s.cov, points[0]!, last, opts.size, hardness, flow, s.carry); s.carry = r.carry; strokeApply(r.rect); }
      }
      function shapeTo(a: [number, number], b: [number, number], button: 0 | 2, commit: boolean) {
        if (!source) return; const raster = active();
        if (!shapeBase) { shapeBase = new Uint8ClampedArray(raster.data); shapeDirty = null; }
        raster.data.set(shapeBase);
        const [fore, back] = colors(button), t = tool.tool;
        let dirty: Rect | null;
        if (t === 'gradient') dirty = gradientFill(raster, a, b, options.gradient, withOpacity(fore), options.gradientEnd === 'transparent' ? [fore[0], fore[1], fore[2], 0] : withOpacity(back));
        else dirty=paintPolicyShape(raster,{kind:'shape',shape:t as 'line'|'rectangle'|'ellipse',a,b,size:options.size,stroke:t==='line'||options.style!=='fill'?fore:null,fill:t==='line'||options.style==='outline'?null:options.style==='fill'?fore:back},source.policy.mode);
        const rect = union(shapeDirty, dirty); shapeDirty = dirty;
        if (selection && rect) maskedMerge({ target: raster, base: shapeBase, mask: selection.mask, rect });
        composite(rect);
        if (commit) { shapeBase = null; shapeDirty = null; if(dirty)perform(t==='gradient'?{kind:'gradient',shape:options.gradient,a,b,start:withOpacity(fore),end:options.gradientEnd==='transparent'?[fore[0],fore[1],fore[2],0]:withOpacity(back)}:{kind:'shape',shape:t as 'line'|'rectangle'|'ellipse',a,b,size:options.size,stroke:t==='line'||options.style!=='fill'?fore:null,fill:t==='line'||options.style==='outline'?null:options.style==='fill'?fore:back},t==='gradient'?'Gradient':`Draw ${TOOLS[t].label.toLowerCase()}`); }
      }
      function setSelection(mask: Uint8Array | null, mode: SelectMode, label = mode === 'replace' ? (mask ? 'Select' : 'Deselect') : `${mode === 'add' ? 'Add' : mode === 'subtract' ? 'Subtract' : 'Intersect'} selection`,operation:ImageOperation={kind:'selection',action:'none'}) {
        if(!source||!current)return;perform(operation,label);
      }
      function fillAt(point: [number, number], button: 0 | 2) {
        if (!source) return;
        const raster = active(), mask = magicWand(raster, point[0], point[1], options.tolerance, options.contiguous);
        if (selection) for (let i = 0; i < mask.length; i++) mask[i] = Math.min(mask[i]!, selection.mask[i]!);
        const bounds = maskBounds(mask, source.width); if (!bounds) return;
        const base = new Uint8ClampedArray(raster.data), cov = { width: raster.width, height: raster.height, data: Float32Array.from(mask, m => m / 255) };
        applyCoverage({ raster, base, cov, rect: bounds, mode: { kind: 'paint', color: colors(button)[0] }, opacity: options.opacity / 100 });
        composite(bounds); perform({kind:'fill',point,color:colors(button)[0],opacity:options.opacity/100,tolerance:options.tolerance,contiguous:options.contiguous,sample:'active'},'Fill');
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
          if (renderedPixels && x >= 0 && y >= 0 && x < source.width && y < source.height) { const i = (y * source.width + x) * 4, c: RGBA = [renderedPixels[i]!, renderedPixels[i + 1]!, renderedPixels[i + 2]!, 255]; if (intent.button === 0) primary = c; else secondary = c; tool = { tool: previousTool, drag: null }; }
        } else if (intent.kind === 'clone-source') { cloneSource = [intent.point[0], intent.point[1]]; message = `Clone source set at ${Math.floor(intent.point[0])}, ${Math.floor(intent.point[1])}.`; }
        else if (intent.kind === 'text') text(intent.point, colors(intent.button)[0]);
        else if (intent.kind === 'wand') setSelection(null,intent.mode,'Magic wand',{kind:'selection',action:'wand',point:intent.point,tolerance:options.tolerance,contiguous:options.contiguous,sample:'active',mode:intent.mode});
        else if (intent.kind === 'marquee') {
          if (intent.drop) placeFloating();
          marquee = intent.commit ? null : { shape: intent.shape, points: intent.points };
          if (intent.commit) {
            const valid = intent.shape === 'polygon' ? intent.points.length > 2 : intent.points.length === 2;
            setSelection(null,valid?intent.mode:'replace',valid?(intent.mode==='replace'?'Select':`${intent.mode==='add'?'Add':intent.mode==='subtract'?'Subtract':'Intersect'} selection`):'Deselect',valid?{kind:'selection',action:'shape',shape:intent.shape==='polygon'?{kind:'polygon',points:intent.points}:{kind:intent.shape,a:intent.points[0]!,b:intent.points[1]!},mode:intent.mode}:{kind:'selection',action:'none'});
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
        const t = placement(), hard = tool.tool === 'pencil' || (['brush', 'eraser'].includes(tool.tool) && options.edge === 'pixel'), diameter = hard ? Math.max(1, Math.round(options.size / options.pixelSize)) * options.pixelSize : options.size, d = diameter * t.z, sized = ['brush', 'airbrush', 'eraser', 'clone', 'blur', 'smudge', 'pencil'].includes(tool.tool);
        ring.hidden = !sized || d < 5;
        if (!ring.hidden) Object.assign(ring.style, { width: `${Math.round(d)}px`, height: `${Math.round(d)}px`, left: `${Math.round(t.x + point[0] * t.z - d / 2)}px`, top: `${Math.round(t.y + point[1] * t.z - d / 2)}px` });
      }
      type TextStyle = { text: string; color: string; size: number; font: string; bold: boolean; italic: boolean; align: 'left' | 'center' | 'right'; spacing: number };
      function rasterizeText(style: TextStyle): Raster | null {
        const lines = style.text.split('\n'), measure = document.createElement('canvas').getContext('2d'); if (!measure || !style.text.trim()) return null;
        const font = `${style.italic ? 'italic ' : ''}${style.bold ? 'bold ' : ''}${style.size}px ${style.font}`; measure.font = font;
        const widths = lines.map(line => measure.measureText(line).width), width = Math.ceil(Math.max(...widths)) + Math.ceil(style.size * 0.3) + 2, lineHeight = Math.ceil(style.size * style.spacing), height = lineHeight * (lines.length - 1) + Math.ceil(style.size * 1.3);
        if (width * height > MAX_PIXELS) throw new RangeError('The text is too large.');
        const out = document.createElement('canvas'); out.width = width; out.height = height; const ctx = out.getContext('2d')!;
        ctx.font = font; ctx.textBaseline = 'top'; ctx.fillStyle = style.color;
        lines.forEach((line, i) => ctx.fillText(line, 1 + (style.align === 'left' ? 0 : (width - 2 - widths[i]!) * (style.align === 'center' ? 0.5 : 1)), i * lineHeight + Math.round(style.size * 0.1)));
        const raster = pixelCoverage({ width, height, data: ctx.getImageData(0, 0, width, height).data }, source!.policy.mode);
        if(source!.policy.mode==='pixel-art'){const rgb=[1,3,5].map(at=>parseInt(style.color.slice(at,at+2),16));for(let i=0;i<raster.data.length;i+=4)if(raster.data[i+3])raster.data.set(rgb,i);}
        return raster;
      }
      function text(point: [number, number], color: RGBA) {
        if (!source) return; const at = { x: Math.floor(point[0]), y: Math.floor(point[1]) };
        const show = (r: Raster | null) => { if (r) { r=imageOutput(r,source!.policy); float.width = r.width; float.height = r.height; floatContext?.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0); float.style.left = `${at.x}px`; float.style.top = `${at.y}px`; float.hidden = false; } else float.hidden = true; };
        const style = (v: Record<string, unknown>): TextStyle => ({ text: String(v.text), color: String(v.color), size: Number(v.size), font: String(v.font), bold: !!v.bold, italic: !!v.italic, align: v.align as TextStyle['align'], spacing: Number(v.spacing) });
        const importFont = async () => {
          const result = await fileAccess({ op: 'pick', accept: { 'font/ttf': ['.ttf'], 'font/otf': ['.otf'] } }, files);
          if ('cancelled' in result) return null;
          if (!result.ok) throw new Error(result.error.message);
          const file = result.value.file;
          if (file.size > MAX_FONT_BYTES) throw new Error('Choose a font up to 32 MiB.');
          return fonts.import(file.name, new Uint8Array(await file.arrayBuffer()));
        };
        host.dialog({ title: 'Text', description: 'Enter starts a new line. Choose OK (or Ctrl+Enter), then drag the handles to resize or rotate. Import your own TTF or OTF font; it stays on this device.', fields: [{ key: 'text', label: 'Text (Enter for a new line)', type: 'text', multiline: true }, { key: 'color', label: 'Color', type: 'color' }, { key: 'size', label: 'Size (px)', type: 'number', min: 4, max: 400, step: 1 },
          { key: 'font', label: 'Font', type: 'select', choices: [{ value: 'Tahoma, Verdana, sans-serif', label: 'Tahoma' }, { value: 'Verdana, sans-serif', label: 'Verdana' }, { value: 'Arial, Helvetica, sans-serif', label: 'Arial' }, { value: '"Times New Roman", Times, serif', label: 'Times New Roman' }, { value: 'Georgia, serif', label: 'Georgia' }, { value: '"Courier New", monospace', label: 'Courier New' }, { value: '"Comic Sans MS", cursive', label: 'Comic Sans' }, { value: 'Impact, sans-serif', label: 'Impact' }, { value: '"Pixel Tahoma"', label: 'Pixel Tahoma (11 / 22 px)' }], loadChoices: () => fonts.choices(), importChoice: { label: 'Import font…', run: importFont } },
          { key: 'bold', label: 'Bold', type: 'checkbox' }, { key: 'italic', label: 'Italic', type: 'checkbox' },
          { key: 'align', label: 'Alignment', type: 'select', choices: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }] },
          { key: 'spacing', label: 'Line spacing', type: 'number', min: 0.8, max: 3, step: 0.05 }],
          initial: { text: '', color: '#' + color.slice(0, 3).map(channel => channel.toString(16).padStart(2, '0')).join(''), size: 24, font: 'Tahoma, Verdana, sans-serif', bold: false, italic: false, align: 'left', spacing: 1.2 },
          validate(values) { const s = Number(values.size); if (!String(values.text).trim()) return { ok: false, error: { code: 'image.text', message: 'Type some text.' } }; if (!Number.isInteger(s) || s < 4 || s > 400) return { ok: false, error: { code: 'image.text', message: 'Size is a whole number from 4 to 400.' } }; return { ok: true, value: values }; },
          preview(value) { try { show(rasterizeText(style(value as Record<string, unknown>))); } catch { show(null); } },
          commit(value) {
            show(null);
            try {
              const v = style(value as Record<string, unknown>), r = rasterizeText(v); if (!r || !source) return;
              // Expose handles immediately, including for small text whose inactive handles are hidden.
              const previousLayer = activeId();
              tool = { tool: 'move', drag: null }; addLayer(r, `Text: ${v.text.split('\n')[0]!.slice(0, 24)}`, 'Text', { x: at.x, y: at.y, select: true });
              if (activeId() !== previousLayer && selection) freeTransform();
            } catch (cause) { fail(cause); }
          },
          cancel() { show(null); },
        });
      }
      /** Start a non-destructive on-canvas transform; sample the original only on apply. */
      function freeTransform() {
        if (!source || transform) return; finishStroke();
        if (!floating) lift(); if (!floating) return;
        const f = floating; transform = { original: copyRaster(f.raster), box: { x: f.x, y: f.y, width: f.raster.width, height: f.raster.height, angle: 0 } };
        f.label = 'Transform'; tool = { tool: 'move', drag: null };
        message = 'Drag handles to resize or rotate · Shift constrains · Enter applies · Esc cancels.'; refresh(); host.invalidate();
      }
      function transformAll(op:TransformOp,label:string){if(!source)return;placeFloating();perform({kind:'transform',transform:op},label);}
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
        if (!fields.length) { try { run({}); perform({kind:'adjust',adjustment:toOp({})},title); } catch (cause) { raster.data.set(base); composite(rect); fail(cause); } return; }
        host.dialog({ title, fields, initial,
          validate(values) { try { adjustRaster({ width: 1, height: 1, data: new Uint8ClampedArray(4) }, toOp(values)); return { ok: true, value: values }; } catch (cause) { return { ok: false, error: { code: 'image.adjust', message: cause instanceof Error ? cause.message : String(cause) } }; } },
          preview(value) { run(value as Record<string, unknown>); },
          commit(value) { run(value as Record<string, unknown>); perform({kind:'adjust',adjustment:toOp(value as Record<string,unknown>)},title); },
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
      function rawComposite(): Raster { const out = createRaster(source!.width, source!.height, [0, 0, 0, 0]); compositeLayers({ width: out.width, height: out.height, layers: source!.layers.map(l => ({ raster: rasters.get(l.id)!, visible: l.visible, opacity: l.opacity, blend: l.blend })), rect: fullRect(), out: out.data }); return out; }
      function flattened(): Raster { return imageOutput(rawComposite(),policyPreview??source!.policy); }
      let clipboard: Raster | null = null;
      async function systemCopy(r: Raster, success = `Copied ${r.width} × ${r.height} pixels. Paste into another app.`) {
        const identity = current?.identity, clip = window.navigator.clipboard, Item = (window as Window & { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
        let copied = false;
        try { if (clip?.write && Item) { await clip.write([new Item({ 'image/png': png(r) })]); copied = true; } } catch { /* Keep the in-app copy, but never claim a system clipboard write succeeded. */ }
        if (!disposed && current?.identity === identity) { message = copied ? success : 'Copied inside Paint only. Browser clipboard access failed; use Export PNG to use the image in another app.'; refresh(); }
      }
      function addLayer(raster:Raster,name:string,label:string,placement={x:0,y:0,select:false}){
        if(!source)return;placeFloating();const asset:ImageRecipeAsset={id:`asset-${crypto.randomUUID()}`,width:raster.width,height:raster.height,data:new Uint8ClampedArray(raster.data)};
        perform({kind:'paste',source:{kind:'asset',id:asset.id},name,box:{x:placement.x,y:placement.y,width:raster.width,height:raster.height},sampling:'nearest',select:placement.select},label,[asset]);
      }
      async function paste(blob?: Blob) {
        if (pendingImages) { fail('An image is still loading. Try Paste again when it finishes.'); return; }
        const identity = current?.identity; pendingImages++; host.invalidate();
        try {
          let pasted: Raster | null = null, fallback = false;
          if (!blob) {
            try {
              if (!window.navigator.clipboard?.read) fallback = true;
              else for (const item of await window.navigator.clipboard.read()) { const type = item.types.find(t => t.startsWith('image/')); if (type) { blob = await item.getType(type); break; } }
            } catch { fallback = true; }
          }
          if (blob) pasted = await decodeImage(blob);
          else if (fallback && clipboard) pasted = copyRaster(clipboard);
          if (disposed) return;
          if (identity !== current?.identity || host.root.hidden) { fail('The Image or workspace changed while reading the clipboard. Paste again into the intended project.'); return; }
          if (!pasted) { fail(fallback ? 'Clipboard access is unavailable. Copy an image, then use Ctrl+V / Cmd+V over the canvas, or Open an image file.' : 'There is no image on the clipboard. Copy an image first.'); return; }
          if (!source || source===starterValue) {
            const value = imageContent({ operation: 'layers', previous: null, width: pasted.width, height: pasted.height, layers: [{ meta: { id: 'background', name: 'Background', visible: true, opacity: 1, blend: 'normal' }, raster: pasted }], activeLayerId: 'background' });
            await host.open({ id: crypto.randomUUID(), title: 'Pasted image', format: 'gsnv-image', version: 1, value }); return;
          }
          placeFloating();
          const fit = pasted.width > source.width || pasted.height > source.height ? Math.min(source.width / pasted.width, source.height / pasted.height) * PASTE_FIT : 1;
          const fitted = fit === 1 ? pasted : affineRaster(pasted, { scaleX: fit * 100, scaleY: fit * 100, angle: 0, sampling });
          const x = Math.floor((source.width - fitted.width) / 2), y = Math.floor((source.height - fitted.height) / 2), previousLayer = activeId();
          const fromClipboard=automation.canReplayClipboard()&&!!clipboard&&pasted.width===clipboard.width&&pasted.height===clipboard.height&&pasted.data.every((byte,i)=>byte===clipboard!.data[i]);
          if(fromClipboard)perform({kind:'paste',source:{kind:'clipboard'},name:'Pasted image',box:{x,y,width:fitted.width,height:fitted.height},sampling,select:true},'Paste');
          else addLayer(fitted, 'Pasted image', 'Paste', { x, y, select: true });
          if (activeId() === previousLayer) return;
          // The committed layer supports Cancel/Undo. Transform from full clipboard pixels, not its fitted/clipped copy.
          paintRaster(active(), { kind: 'clear', rect: fullRect(), color: [0, 0, 0, 0] }); composite();
          floating = { raster: pasted, x, y, origin: { x, y }, label: 'Transform',...(fromClipboard?{fromClipboard:true}:{asset:{id:`asset-${crypto.randomUUID()}`,width:pasted.width,height:pasted.height,data:new Uint8ClampedArray(pasted.data)}}) };
          transform = { original: copyRaster(pasted), box: { x, y, width: fitted.width, height: fitted.height, angle: 0 } };
          float.width = pasted.width; float.height = pasted.height; floatContext?.putImageData(new ImageData(new Uint8ClampedArray(pasted.data), pasted.width, pasted.height), 0, 0);
          tool = { tool: 'move', drag: null }; message = 'Image pasted on a new layer. Drag handles to resize or rotate · Enter applies · Esc keeps its initial placement.'; refresh();
        } catch (cause) { fail(`The clipboard image could not be pasted: ${cause instanceof Error ? cause.message : String(cause)}`);
        } finally { pendingImages--; host.invalidate(); }
      }
      async function importImage(asLayer: boolean, file?: File) {
        const identity = current?.identity; pendingImages++; host.invalidate();
        try {
        const result = await fileAccess({ op: 'open', accept: IMAGE_TYPES, file }, files);
        if (disposed || 'cancelled' in result) return;
        if (!result.ok) { fail(`${result.error.code}: ${result.error.message}`); return; }
        try {
          const next = await decodeImage(new Blob(result.value.bytes.map(b => b.slice())));
          if (disposed) return;
          if (identity !== current?.identity) { fail('The Image changed while importing. Open the image again into the current project.'); return; }
          if (asLayer && source) { addLayer(next, basename(result.value.name), 'Import as layer'); return; }
          const value = imageContent({ operation: 'layers', previous: null, width: next.width, height: next.height, layers: [{ meta: { id: 'background', name: 'Background', visible: true, opacity: 1, blend: 'normal' }, raster: next }], activeLayerId: 'background' });
          await host.open({ id: crypto.randomUUID(), title: basename(result.value.name), format: 'gsnv-image', version: 1, value });
        } catch (cause) { fail(`This image could not be opened: ${cause instanceof Error ? cause.message : String(cause)}`); }
        } finally { pendingImages--; host.invalidate(); }
      }
      async function exportPNG() {
        if (!source || !current) return; placeFloating();
        try {
          const bytes = new Uint8Array(await (await png(flattened())).arrayBuffer()), result = await fileAccess({ op: 'save', name: `${current.title.trim() || 'image'}.png`, mime: 'image/png', bytes }, files);
          if ('cancelled' in result) return; message = result.ok ? `Exported ${result.value.name}.` : `${result.error.code}: ${result.error.message}`; refresh();
        } catch (cause) { fail(cause); }
      }
      function layerAction(action:LayerAction){
        if(!source||!current)return;placeFloating();const list=source.layers,index=list.findIndex(l=>l.id===activeId());
        if(action.id==='select'){const target=list.findIndex(l=>l.id===action.layerId);if(target!==index)perform({kind:'layer',action:'select',index:target},'Select layer');}
        else if(action.id==='toggle'){const target=list.findIndex(l=>l.id===action.layerId);perform({kind:'layer',action:'visibility',index:target,visible:!list[target]!.visible},'Layer visibility');}
        else if(action.id==='rename'){const target=list.findIndex(l=>l.id===action.layerId);host.dialog({title:'Layer properties',fields:[{key:'name',label:'Name',type:'text'}],initial:{name:list[target]!.name},validate:v=>String(v.name).trim()?{ok:true,value:v}:{ok:false,error:{code:'image.layer',message:'Name the layer.'}},preview(){},cancel(){},commit(v){perform({kind:'layer',action:'rename',index:target,name:String((v as Record<string,unknown>).name).trim()},'Rename layer');}});}
        else if(action.id==='opacity'){opacityPreview=action.value;composite();if(action.commit){opacityPreview=null;perform({kind:'layer',action:'opacity',index,opacity:action.value},'Layer opacity');}else refresh();}
        else if(action.id==='blend')perform({kind:'layer',action:'blend',index,blend:action.value},'Blend mode');
        else if(action.id==='new')perform({kind:'layer',action:'new',name:`Layer ${list.length+1}`},'New layer');
        else if(action.id==='duplicate')perform({kind:'layer',action:'duplicate',index},'Duplicate layer');
        else if(action.id==='delete'&&list.length>1)perform({kind:'layer',action:'delete',index},'Delete layer');
        else if((action.id==='up'&&index<list.length-1)||(action.id==='down'&&index>0))perform({kind:'layer',action:'reorder',index,to:index+(action.id==='up'?1:-1)},action.id==='up'?'Move layer up':'Move layer down');
        else if(action.id==='mergeDown'&&index>0)perform({kind:'layer',action:'mergeDown',index},'Merge down');
      }
      function command(id: string) {
        if(id.startsWith('automation.')){automation.command(id);return;}
        if (id === 'edit.paste') { void paste(); return; }
        if (!source || !current) return;
        message = '';
        if (id === 'bridge.imageToVideo') { void host.transfer?.({ route: 'image-to-video-bin' }); return; }
        const toolId = id.startsWith('image.') ? id.slice(6) as ImageTool : null;
        if (toolId && (IMAGE_TOOLS as readonly string[]).includes(toolId)) { if (transform) placeFloating(); if (!['select', 'ellipseSelect', 'lasso', 'move'].includes(toolId)) placeFloating(); if (toolId === 'picker' && tool.tool !== 'picker') previousTool = tool.tool; tool = imageToolInput({ state: tool, event: { kind: 'tool', tool: toolId }, inside: () => false, floating: !!floating }).state; refresh(); return; }
        if (id === 'filter.downpixel') { downpixel(); return; }
        if (id === 'image.pixelSettings') { pixelSettings(); return; }
        if (id === 'image.transform') { freeTransform(); return; }
        if (id === 'image.copyCanvas') { finishStroke(); placeFloating(); perform({kind:'clipboard',action:'copy',source:'canvas',background:secondary},'Copy canvas'); if(clipboard)void systemCopy(clipboard, 'Canvas copied. Paste into another app.'); return; }
        if (id.startsWith('image.nudge')) {
          if (!floating && selection) lift(); if (!floating) return;
          const d = { nudgeLeft: [-1, 0], nudgeRight: [1, 0], nudgeUp: [0, -1], nudgeDown: [0, 1] }[id.slice(6) as 'nudgeLeft']!; if (transform) { transform.box = { ...transform.box, x: transform.box.x + d[0]!, y: transform.box.y + d[1]! }; refresh(); return; } floating.x += d[0]!; floating.y += d[1]!; floating.origin = { x: floating.x, y: floating.y }; refresh(); return;
        }
        if (id === 'image.sizeUp' || id === 'image.sizeDown') { options = { ...options, size: Math.min(500, Math.max(1, id === 'image.sizeUp' ? Math.ceil(options.size * 1.2 + 0.5) : Math.floor(options.size / 1.2))) }; refresh(); return; }
        if (id === 'tool.cancel') { const transient = !!floating || !!stroke || !!shapeBase || !!marquee; pointer({ kind: 'cancel' }); if (transient) { floating = null; resync(); } else setSelection(null, 'replace'); refresh(); return; }
        if (id === 'tool.confirm') { placeFloating(); refresh(); return; }
        if (id === 'color.swap') { [primary, secondary] = [secondary, primary]; refresh(); return; }
        if (id === 'color.reset') { primary = BLACK; secondary = WHITE; refresh(); return; }
        if (id === 'view.fit' || id === 'image.actualSize') { fitView(id === 'view.fit' ? 'fit' : 'actual'); refresh(); return; }
        if (id === 'edit.selectAll') { placeFloating(); setSelection(null,'replace','Select all',{kind:'selection',action:'all'}); refresh(); return; }
        if (id === 'image.deselect') { placeFloating(); setSelection(null, 'replace'); refresh(); return; }
        if (id === 'image.invertSelection') { placeFloating(); setSelection(null,'replace','Invert selection',{kind:'selection',action:'invert'}); refresh(); return; }
        if (floating && ['edit.copy', 'edit.cut', 'edit.delete'].includes(id)) placeFloating();
        if(id==='edit.copy'||id==='edit.cut'){perform({kind:'clipboard',action:id==='edit.copy'?'copy':'cut',source:'selection',background:secondary},id==='edit.copy'?'Copy':'Cut');if(clipboard)void systemCopy(clipboard);refresh();return;}
        if(id==='edit.delete'){perform({kind:'delete',background:secondary},'Delete');refresh();return;}
        if (id === 'image.crop') { placeFloating(); if (selection) transformAll({ kind: 'crop', rect: selection.bounds }, 'Crop'); return; }
        if (id === 'image.flatten') { placeFloating(); perform({kind:'layer',action:'flatten'},'Flatten image'); return; }
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
          'filter.pixelate': () => adjust('Pixelate (averaged)', [num('size', 'Cell size (px)', 2, 256)], { size: 8 }, v => ({ kind: 'pixelate', size: Number(v.size) })),
          'filter.findEdges': () => adjust('Find edges', [], {}, () => ({ kind: 'findEdges' })), 'filter.emboss': () => adjust('Emboss', [], {}, () => ({ kind: 'emboss' })),
        };
        adjustments[id]?.();
      }
      function batchProcess(recipe:ImageRecipe){
        const runner=createImageReplay(),native=window as unknown as Partial<BatchFilePorts>;
        const ports:BatchFilePorts={document,...(native.showDirectoryPicker?{showDirectoryPicker:native.showDirectoryPicker.bind(window)}:{}),...(native.showOpenFilePicker?{showOpenFilePicker:native.showOpenFilePicker.bind(window)}:{})};
        host.dialog(imageBatchDialog({document,recipe,ports,
          async decode(file){if(file.size>256*1024*1024)throw new Error('Batch input files must be at most 256 MiB.');if(/\.gsnv-image$/i.test(file.name)){const pack=nativeContainer({op:'decode',parts:[new Uint8Array(await file.arrayBuffer())]});if(pack.project.format!=='gsnv-image')throw new Error('This is not a Paint project.');return imageContent({operation:'decode',content:pack.project.content,assets:pack.assets});}
            const raster=await decodeImage(file);return imageContent({operation:'layers',previous:null,width:raster.width,height:raster.height,layers:[{meta:{id:'background',name:'Background',visible:true,opacity:1,blend:'normal'},raster}],activeLayerId:'background'});},
          async encode(value,output,name){if(output==='png')return png(imageOutput(mergedImage(value),value.policy));const encoded=imageContent({operation:'encode',value});const pack=nativeContainer({op:'encode',package:{project:{format:'gsnv-image',version:1,id:crypto.randomUUID(),title:basename(name),content:encoded.content},assets:encoded.assets.map(a=>({...a,mime:'application/octet-stream'}))}});return new Blob(pack.parts.map(p=>p.slice()),{type:'application/octet-stream'});},
          replay:(value,actions)=>runner.run(value,actions),stop:()=>runner.cancel(),onClose:()=>runner.dispose(),
          async onDownload(blob,name){const url=window.URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.hidden=true;document.body.append(a);a.click();a.remove();window.setTimeout(()=>window.URL.revokeObjectURL(url),60000);message=`ZIP download started: ${name}`;refresh();}
        }));
      }
      function downpixel() {
        if(!source||!current)return;finishStroke();placeFloating();
        const original=source,identity=current.identity,job=createImageEffects();let sequence=0,closed=false,key='',latest:Promise<ImageContent>|null=null;
        const run=(settings:{width:number;height:number;resize:boolean})=>{
          const next=JSON.stringify(settings);if(key===next&&latest)return latest;
          key=next;const token=++sequence;job.cancel();
          latest=(async()=>{const stack=[];for(const layer of original.layers){if(token!==sequence)throw new DOMException('Preview changed','AbortError');const raster=await job.run({kind:'downpixel',raster:imageContent({operation:'raster',value:original,layerId:layer.id}),...settings});stack.push({meta:meta(layer),raster});}
            return imageContent({operation:'layers',previous:original,width:stack[0]!.raster.width,height:stack[0]!.raster.height,layers:stack,activeLayerId:original.activeLayerId});})();return latest;
        };
        host.dialog(imageDownpixelDialog({...original,
          preview(settings){const token=JSON.stringify(settings);message='Preparing down-pixel preview…';refresh();void run(settings).then(value=>{if(!closed&&token===key&&current?.identity===identity){resync(imageContent({operation:'selection',previous:value,mask:null}));message='Down-pixel preview';refresh();}}).catch(cause=>{if(!closed&&!(cause instanceof DOMException&&cause.name==='AbortError'))fail(cause);});},
          commit(settings){closed=true;pendingImages++;resync();message='Applying down-pixel…';refresh();void run(settings).then(value=>{if(!disposed&&current?.identity===identity){commitOperation(imageContent({operation:'selection',previous:value,mask:null}),'Down-pixel',{kind:'downpixel',...settings});}}).catch(fail).finally(()=>{job.dispose();pendingImages--;host.invalidate();});},
          cancel(){closed=true;++sequence;job.dispose();resync();message='';refresh();}}));
      }
      function pixelSettings() {
        if(!source||!current)return; finishStroke();placeFloating();const original=source;
        host.dialog(imagePolicyDialog({document,policy:original.policy,raster:rawComposite(),
          onPreview(policy){policyPreview=policy;canvasRendering=policy.mode==='pixel-art'?'pixels':'smooth';composite();refresh();},
          onCommit(policy){policyPreview=null;const value=imageContent({operation:'policy',previous:original,policy});perform({kind:'policy',policy},'Pixel settings');},
          onCancel(){policyPreview=null;canvasRendering=original.policy.mode==='pixel-art'?'pixels':'smooth';composite();refresh();}}));
      }
      /** Shows the whole image (or 100% pixels) centred, whatever the shell zoom and pan are. */
      function fitView(mode: 'fit' | 'actual') {
        if (!source) return; const w = stage.clientWidth || 800, h = stage.clientHeight || 600;
        const effective = mode === 'actual' ? 1 : Math.min((w - 2 * MARGIN) / source.width, (h - 2 * MARGIN) / source.height, 1);
        scale = Math.max(effective, 0.01) / view.zoom; offset = { x: 0, y: 0 };
        const o = origin(); offset = { x: (Math.max(MARGIN, (w - source.width * scale * view.zoom) / 2) - view.pan.x) / view.zoom - o.x, y: (Math.max(MARGIN, (h - source.height * scale * view.zoom) / 2) - view.pan.y) / view.zoom - o.y };
      }
      function viewSettings() {
        if (!source || !current) return;
        const original = { scale, offset, canvasRendering }, placed = placement();
        const base: View2D = { zoom: placed.z, pan: { x: placed.x, y: placed.y } };
        const center = { x: stage.clientWidth / 2, y: stage.clientHeight / 2 }, range = { min: 0.01, max: 64 };
        host.dialog({ title: 'View settings', description: 'Sharp pixels keeps pixel boundaries crisp at every zoom. Smooth blends the display only; neither changes your image.', fields: [
          { key: 'rendering', label: 'Canvas rendering', type: 'select', choices: [{ value: 'pixels', label: 'Sharp pixels (nearest)' }, { value: 'smooth', label: 'Smooth (interpolated)' }] },
          { key: 'zoom', label: 'Zoom (%)', type: 'number', min: 1, max: 6400 },
          { key: 'x', label: 'Horizontal offset (px)', type: 'number' },
          { key: 'y', label: 'Vertical offset (px)', type: 'number' },
        ], initial: { rendering: canvasRendering, zoom: base.zoom * 100, x: 0, y: 0 },
        validate(values) {
          try {
            const zoomed = viewTransform({ view: base, range, action: { type: 'zoom', factor: Number(values.zoom) / (100 * base.zoom), cursor: center } });
            const moved = viewTransform({ view: zoomed, range, action: { type: 'pan', delta: { x: Number(values.x), y: Number(values.y) } } });
            return { ok: true, value: { rendering: String(values.rendering), zoom: moved.zoom, pan: { ...moved.pan } } };
          } catch (error) { return { ok: false, error: { code: 'image.view', message: error instanceof Error ? error.message : String(error) } }; }
        },
        preview(value) {
          const next = value as View2D & { rendering: 'pixels' | 'smooth' }; canvasRendering = next.rendering;
          // Fit and wheel transforms compose; typed values describe their effective pixel scale.
          scale = next.zoom / view.zoom; offset = { x: 0, y: 0 };
          const o = origin(); offset = { x: (next.pan.x - view.pan.x) / view.zoom - o.x, y: (next.pan.y - view.pan.y) / view.zoom - o.y };
          refresh();
        }, commit() {}, cancel() { scale = original.scale; offset = original.offset; canvasRendering = original.canvasRendering; refresh(); } });
      }
      // Let the browser deliver clipboard image Files for Ctrl/Cmd+V, including when
      // Async Clipboard read permission is unavailable. Text fields keep native paste.
      const acceptsCanvasPaste = (target: EventTarget | null) => !disposed && !host.root.hidden
        && !document.querySelector('dialog[open]')
        && !(target instanceof Element && target.closest('input, textarea, select, [contenteditable]'));
      const pasteKey = (event: KeyboardEvent) => {
        if (acceptsCanvasPaste(event.target) && !event.isComposing && !event.altKey && !event.shiftKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') event.stopPropagation();
      };
      const nativePaste = (event: ClipboardEvent) => {
        if (!acceptsCanvasPaste(event.target)) return;
        const file = Array.from(event.clipboardData?.files ?? []).find(file => file.type.startsWith('image/'));
        if (!file) return;
        event.preventDefault(); event.stopPropagation(); void paste(file);
      };
      document.addEventListener('keydown', pasteKey, true);
      document.addEventListener('paste', nativePaste, true);
      const Resize = window.ResizeObserver, observer = Resize ? new Resize(() => layout()) : null; observer?.observe(stage);
      return {
        bridge,
        flush() { transformView.flush(); finishStroke(); placeFloating(); refresh(); },
        newDocument() { host.dialog(imageNewDialog({document,colour:primary,onCreate(settings){void host.open({id:crypto.randomUUID(),title:'Untitled image',format:'gsnv-image',version:1,value:imageContent({operation:'new',...settings})});}})); },
        openFile: { accept: IMAGE_TYPES, open: file => importImage(false, file) },
        render(snapshot, nextView) {
          if(snapshot?.value)automation.navigate(snapshot.value as ImageContent);
          const changed = snapshot?.identity !== current?.identity, opened = snapshot?.id !== current?.id; current = snapshot; view = nextView;
          if (changed) { shapeBase = null; shapeDirty = null; marquee = null; tool = { ...tool, drag: null }; if (stroke?.timer) window.clearInterval(stroke.timer); stroke = null; opacityPreview = null; }
          if (!snapshot) { source = null; rasters.clear(); floating = null; selection = null; edges = null; }
          // Undo, redo, open and rejected commits all arrive as a value this view did not produce.
          else if (snapshot.value !== source) {
            floating = null; resync();
          }
          if (opened && source) { message = ''; fitView('fit'); }
          refresh();
        },
        model() {
          const enabled = !!current, has = enabled && (!!selection || !!floating);
          const item = (id: string, label: string, icon?: string, shortcut = '', toolbar = false, on = enabled) => ({ id, label, shortcut, enabled: on, ...(icon ? { icon } : {}), ...(toolbar ? { toolbar } : {}) });
          const index = source?.layers.findIndex(l => l.id === activeId()) ?? -1, count = source?.layers.length ?? 0;
          return {
            menus: [automation.model(),
              { id: 'select', label: 'Select', items: [item('edit.selectAll', 'Select all', 'select', 'Ctrl+A'), item('image.deselect', 'Deselect', undefined, '', false, has), item('image.invertSelection', 'Invert selection'), item('edit.copy', 'Copy', 'copy', 'Ctrl+C', false, has), item('edit.cut', 'Cut', 'cut', 'Ctrl+X', false, has), item('image.copyCanvas', 'Copy canvas', 'copy', '', true), item('edit.paste', 'Paste', 'paste', 'Ctrl+V', true, !pendingImages), item('edit.delete', 'Delete', 'delete', 'Delete', false, has), item('image.crop', 'Crop to selection', 'crop', '', true, has), item('image.transform', 'Free transform', 'rotate', 'Ctrl+T', true), item('image.nudgeLeft', 'Nudge left', undefined, '←', false, has), item('image.nudgeRight', 'Nudge right', undefined, '→', false, has), item('image.nudgeUp', 'Nudge up', undefined, '↑', false, has), item('image.nudgeDown', 'Nudge down', undefined, '↓', false, has)] },
              { id: 'image', label: 'Image', items: [item('image.import', 'Open image…', 'open'), item('image.importLayer', 'Import as layer…', 'layerAdd'), item('image.exportPNG', 'Export PNG…', 'export', '', true), item('bridge.imageToVideo', 'Send image to Video bin', 'video', '', false, enabled && !!host.transfer && !pendingTransfer()), item('image.pixelSettings', 'Pixel settings…', 'grid'), item('image.resize', 'Resize…', 'fit'), item('image.canvasSize', 'Canvas size…', 'grid'),
                item('image.rotateRight', 'Rotate right', 'rotate', '', true), item('image.rotateLeft', 'Rotate left', 'rotate'), item('image.rotate180', 'Rotate 180°', 'rotate'), item('image.flipH', 'Flip horizontal', 'flip', '', true), item('image.flipV', 'Flip vertical', 'flip'),
                item('image.flatten', 'Flatten image', 'layers', '', false, enabled && count > 1), item('view.fit', 'Zoom to fit', 'fit', 'F'), item('image.actualSize', 'Actual pixels', 'zoomIn'), item('image.sizeUp', 'Larger brush', undefined, ']'), item('image.sizeDown', 'Smaller brush', undefined, '['), item('color.swap', 'Swap colours', undefined, 'X'), item('color.reset', 'Default colours', undefined, 'D')] },
              { id: 'layer', label: 'Layer', items: [item('layer.new', 'New layer', 'layerAdd', '', true), item('layer.duplicate', 'Duplicate layer', 'copy'), item('layer.delete', 'Delete layer', 'delete', '', false, enabled && count > 1), item('layer.up', 'Move up', undefined, '', false, enabled && index < count - 1), item('layer.down', 'Move down', undefined, '', false, enabled && index > 0), item('layer.mergeDown', 'Merge down', 'layers', '', false, enabled && index > 0)] },
              { id: 'adjust', label: 'Adjustments', items: [item('adjust.brightnessContrast', 'Brightness/Contrast…'), item('adjust.hueSaturation', 'Hue/Saturation…'), item('adjust.levels', 'Levels…'), item('adjust.curves', 'Curves…'), item('adjust.colorBalance', 'Colour balance…'), item('adjust.desaturate', 'Desaturate'), item('adjust.invert', 'Invert colours'), item('adjust.sepia', 'Sepia'), item('adjust.posterize', 'Posterize…'), item('adjust.threshold', 'Threshold…')] },
              { id: 'filter', label: 'Filters', items: [item('filter.gaussianBlur', 'Gaussian blur…'), item('filter.unsharpMask', 'Unsharp mask…'), item('filter.addNoise', 'Add noise…'), item('filter.downpixel', 'Down-pixel…', 'grid'), item('filter.pixelate', 'Pixelate (averaged)…'), item('filter.findEdges', 'Find edges'), item('filter.emboss', 'Emboss')] },
            ],
            tools: IMAGE_TOOLS.map(id => ({ id: `image.${id}`, label: TOOLS[id].label, icon: TOOLS[id].icon, shortcut: TOOLS[id].key, enabled, status: TOOLS[id].hint, active: enabled && tool.tool === id })),
            panels: [{ id: 'image-options', title: 'Colours and tool options', content: optionsPanel }, { id: 'image-layers', title: 'Layers', content: layersPanel }],
          };
        },
        viewSettings,
        context: () => ({ viewRole: 'canvas2d', activeTool: tool.tool, status: hint.textContent ?? '', singlePointer: true }),
        command(id) { try { command(id); } catch (cause) { fail(cause); } host.invalidate(); },
        gesture(gesture) {
          if (!source || gesture.type !== 'pointer') return;
          if (gesture.button === 1 || panning) {
            if (gesture.phase === 'down' && gesture.button === 1) { panning = { ...gesture.point }; stage.dataset.panning = 'true'; }
            else if (panning && gesture.phase === 'move') { offset = { x: offset.x + (gesture.point.x - panning.x) / view.zoom, y: offset.y + (gesture.point.y - panning.y) / view.zoom }; panning = { ...gesture.point }; layout(); }
            else if (gesture.phase === 'up' || gesture.phase === 'cancel') { panning = null; delete stage.dataset.panning; }
            return;
          }
          if (transform) { if (gesture.phase === 'down') { placeFloating(); refresh(); host.invalidate(); } return; }
          try {
            const point = toDocument(gesture.point); cursor = point;
            if (gesture.phase === 'cancel') {
              // Browser gesture/palm rejection must not erase the pixels already drawn.
              // Commit before clearing the drag; explicit Escape still restores its base.
              if (gesture.reason === 'interrupted') finishStroke();
              pointer({ kind: 'cancel' }); ring.hidden = true;
            }
            else pointer({ kind: gesture.phase, point, button: gesture.button, shift: gesture.shift, ctrl: gesture.ctrl });
          } catch (cause) { fail(cause); }
          if (gesture.phase !== 'move') host.invalidate();
        },
        dispose() { if (disposed) return; disposed = true; automation.dispose(); effects.dispose(); fonts.dispose(); document.removeEventListener('keydown', pasteKey, true); document.removeEventListener('paste', nativePaste, true); window.clearInterval(antTimer); if (stroke?.timer) window.clearInterval(stroke.timer); observer?.disconnect(); navigator.dispose(); transformView.dispose(); palette.dispose(); layers.dispose(); host.root.replaceChildren(); },
      };
    },
  };
}
