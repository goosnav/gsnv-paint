/**
 * PURPOSE    Adapt recorded Image coordinates to another input size.
 * KIND       CORE
 * CONTRACT   Valid operation plus valid reference/target dimensions returns a
 *            validated owned operation. RAISES: RangeError if scaled limits fail.
 * GUARANTEES x/y scale independently; scalar distances use the smaller factor;
 *            explicit resize/canvas/downpixel target dimensions remain absolute.
 * TUNING     Coordinate/brush limits are enforced by operation validation.
 * DECISIONS  D1: Scale each step from its own reference, including after resizing.
 *            Alternative: one initial scale. Revisit if relative dimensions are added.
 * LIMITS     Rotation angles and dimensionless values are unchanged.
 * TESTBENCH  src/image/image-operations.test.ts
 * DEMO       node --import tsx src/image/image-operations.demo.ts
 */
import { isRasterSize } from './raster-ops.ts';
import { validateImageOperation } from './image-operations-validate.ts';
import type { ImageOperation, ImagePoint, ImageReference } from './image-operation-types.ts';
export function scaleImageOperation(operation: ImageOperation, reference: ImageReference, target: ImageReference): ImageOperation {
  for (const r of [reference, target]) if (!r || !isRasterSize(r.width, r.height)) throw new RangeError('Invalid recipe reference size.');
  const op = validateImageOperation(operation), x = target.width / reference.width, y = target.height / reference.height, scalar = Math.min(x, y);
  const point = (p: ImagePoint): ImagePoint => [p[0] * x, p[1] * y], size = (s: number) => Math.max(1, Math.round(s * scalar));
  const box = <T extends { x: number; y: number; width: number; height: number }>(b: T): T => ({ ...b, x: b.x * x, y: b.y * y, width: Math.max(1, b.width * x), height: Math.max(1, b.height * y) });
  let result: ImageOperation = op;
  if (op.kind === 'stroke') result = { ...op, segments: op.segments.map(s => ({ ...s, points: s.points.map(point) })), cloneOffset: op.cloneOffset && point(op.cloneOffset), options: { ...op.options, size: size(op.options.size), pixelSize: size(op.options.pixelSize) } };
  else if (op.kind === 'shape') result = { ...op, a: point(op.a), b: point(op.b), size: size(op.size) };
  else if (op.kind === 'fill') result = { ...op, point: point(op.point) };
  else if (op.kind === 'gradient') result = { ...op, a: point(op.a), b: point(op.b) };
  else if (op.kind === 'selection' && op.action === 'wand') result = { ...op, point: point(op.point) };
  else if (op.kind === 'selection' && op.action === 'shape') result = { ...op, shape: op.shape.kind === 'polygon' ? { ...op.shape, points: op.shape.points.map(point) } : { ...op.shape, a: point(op.shape.a), b: point(op.shape.b) } };
  else if (op.kind === 'move') result = { ...op, dx: op.dx * x, dy: op.dy * y };
  else if (op.kind === 'paste') result = { ...op, box: box(op.box) };
  else if (op.kind === 'affine') result = { ...op, box: box(op.box) };
  else if (op.kind === 'adjust') {
    const a = op.adjustment;
    if (a.kind === 'gaussianBlur' || a.kind === 'unsharpMask') result = { ...op, adjustment: { ...a, radius: a.radius * scalar } };
    else if (a.kind === 'pixelate') result = { ...op, adjustment: { ...a, size: Math.max(2, Math.round(a.size * scalar)) } };
  } else if (op.kind === 'transform' && op.transform.kind === 'crop') {
    const b = box(op.transform.rect); result = { ...op, transform: { ...op.transform, rect: { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) } } };
  }
  return validateImageOperation(result);
}
