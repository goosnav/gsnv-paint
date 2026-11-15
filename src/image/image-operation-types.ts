/**
 * PURPOSE    Define portable semantic Image edits.
 * KIND       CORE
 * CONTRACT   Type-only operations use document coordinates, RGBA bytes, layer
 *            indices bottom-to-top and normalized opacity. Runtime entrypoints
 *            validate unknown input before execution. No implicit file commands.
 * GUARANTEES Strokes retain delivery segments and actual spray seeds; no clock,
 *            DOM, external asset references or document-specific layer IDs.
 * TUNING     Recipe resource limits live in image-recipe.ts.
 * DECISIONS  D1: Semantic edits replay against input pixels, unlike saved diffs.
 *            Revisit if editable vector or nondestructive adjustment layers arrive.
 *            Alternative: saved diffs, rejected because input images differ.
 * LIMITS     Raster text is an embedded asset; scripts cannot request font loading.
 * TESTBENCH  src/image/image-operations.test.ts
 * DEMO       node --import tsx src/image/image-operations.demo.ts
 */
import type { ImageContent } from './image-content.ts';
import type { AdjustOp } from './image-adjust.ts';
import type { BlendMode } from './image-composite.ts';
import type { PixelPolicy } from './image-pixel-policy.ts';
import type { Raster, RGBA, Rect } from './raster-ops.ts';
import type { TransformOp } from './raster-transform.ts';

export type ImagePoint = readonly [number, number];
export type ImageReference = { readonly width: number; readonly height: number };
export type ImageStrokeOptions = { readonly size: number; readonly pixelSize: number; readonly edge: 'pixel' | 'smooth'; readonly hardness: number; readonly opacity: number; readonly flow: number; readonly strength: number; readonly density: number };
export type ImageStrokeSegment = { readonly points: readonly ImagePoint[]; readonly seed: number };
type Stroke = { kind: 'stroke'; tool: 'pencil' | 'brush' | 'eraser' | 'airbrush' | 'clone' | 'blur' | 'smudge'; segments: readonly ImageStrokeSegment[]; options: ImageStrokeOptions; color: RGBA; background: RGBA; cloneOffset: ImagePoint | null };
type Shape = { kind: 'shape'; shape: 'line' | 'rectangle' | 'ellipse'; a: ImagePoint; b: ImagePoint; size: number; stroke: RGBA | null; fill: RGBA | null };
type Selection = { kind: 'selection'; action: 'all' | 'none' | 'invert' }
  | { kind: 'selection'; action: 'shape'; shape: { kind: 'rectangle' | 'ellipse'; a: ImagePoint; b: ImagePoint } | { kind: 'polygon'; points: readonly ImagePoint[] }; mode: 'replace' | 'add' | 'subtract' | 'intersect' }
  | { kind: 'selection'; action: 'wand'; point: ImagePoint; tolerance: number; contiguous: boolean; sample: 'active' | 'merged'; mode: 'replace' | 'add' | 'subtract' | 'intersect' };
type Layer = { kind: 'layer'; action: 'select' | 'duplicate' | 'delete' | 'mergeDown'; index: number }
  | { kind: 'layer'; action: 'new'; name: string }
  | { kind: 'layer'; action: 'rename'; index: number; name: string }
  | { kind: 'layer'; action: 'visibility'; index: number; visible: boolean }
  | { kind: 'layer'; action: 'opacity'; index: number; opacity: number }
  | { kind: 'layer'; action: 'blend'; index: number; blend: BlendMode }
  | { kind: 'layer'; action: 'reorder'; index: number; to: number }
  | { kind: 'layer'; action: 'flatten' };
export type ImageOperation = Stroke | Shape | Selection | Layer
  | { kind: 'fill'; point: ImagePoint; color: RGBA; opacity: number; tolerance: number; contiguous: boolean; sample: 'active' | 'merged' }
  | { kind: 'gradient'; shape: 'linear' | 'radial'; a: ImagePoint; b: ImagePoint; start: RGBA; end: RGBA }
  | { kind: 'clipboard'; action: 'copy' | 'cut'; source: 'selection' | 'canvas'; background: RGBA }
  | { kind: 'delete'; background: RGBA }
  | { kind: 'paste'; source: { kind: 'clipboard' } | { kind: 'asset'; id: string }; name: string; box: { x: number; y: number; width: number; height: number }; sampling: 'nearest' | 'bilinear'; select: boolean }
  | { kind: 'move'; dx: number; dy: number; background: RGBA }
  | { kind: 'affine'; asset?: string; clipboard?: true; box: Rect & { angle: number }; sampling: 'nearest' | 'bilinear'; background: RGBA }
  | { kind: 'adjust'; adjustment: AdjustOp }
  | { kind: 'transform'; transform: TransformOp }
  | { kind: 'policy'; policy: PixelPolicy }
  | { kind: 'downpixel'; width: number; height: number; resize: boolean };
export type ImageOperationState = { readonly image: ImageContent; readonly clipboard: Raster | null };
export type ImageRecipeAsset = { readonly id: string; readonly width: number; readonly height: number; readonly data: Uint8ClampedArray };
export type ImageRecipeStep = { readonly id: string; readonly label: string; readonly enabled: boolean; readonly reference: ImageReference; readonly operation: ImageOperation };
export type ImageRecipe = { readonly format: 'gsnv-actions'; readonly version: 1; readonly name: string; readonly steps: readonly ImageRecipeStep[]; readonly assets: readonly ImageRecipeAsset[]; readonly output: 'png' | 'project' };
