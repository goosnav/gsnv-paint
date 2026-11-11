/**
 * PURPOSE    Transform a two-dimensional viewport around its cursor.
 * KIND       CORE
 * CONTRACT   IN: ViewRequest; finite coordinates and positive finite zoom/factor/range,
 *            with range.min <= range.max; screen values in CSS pixels.
 *            OUT: View2D or document Point; zoom clamped to range, document coordinate
 *            at cursor invariant under zoom, input unmodified.
 *            RAISES: RangeError for invalid bounds, coordinates or unrepresentable output.
 * GUARANTEES Deterministic, no I/O, no rounding to raster pixels or domain units.
 * TUNING     Caller-supplied range; Image uses {min:0.01,max:64}.
 * DECISIONS  D1: Keep continuous coordinates and clamp only zoom. Alternative: round
 *            to pixels here; rejected because it drifts the zoom anchor and prevents
 *            subpixel positioning. Revisit if a separate snapping contract is added.
 * LIMITS     Two-dimensional affine view only; 3D cameras and snapping are separate.
 * TESTBENCH  src/shared/view-transform.test.ts -- run with: node --import tsx --test src/shared/view-transform.test.ts
 */

type Point = { readonly x: number; readonly y: number };
export type View2D = { readonly zoom: number; readonly pan: Point };
export type ViewRequest = {
  view: View2D;
  action: { type: 'zoom'; factor: number; cursor: Point } | { type: 'pan'; delta: Point } | { type: 'toDocument'; point: Point };
  range: { min: number; max: number };
};
type ActionOutput<A> = A extends { type: 'toDocument' } ? Point : View2D;
type ViewOutput<T extends ViewRequest> = ActionOutput<T['action']>;

function checkPoint(point: Point): void {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError('View coordinates must be finite.');
  }
}

function checkPositive(value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError('View zoom and bounds must be positive and finite.');
}

export function viewTransform<T extends ViewRequest>({ view, action, range }: T): ViewOutput<T> {
  checkPositive(view.zoom);
  checkPositive(range.min);
  checkPositive(range.max);
  if (range.min > range.max) throw new RangeError('Minimum zoom cannot exceed maximum zoom.');
  checkPoint(view.pan);
  let output: View2D | Point;
  if (action.type === 'toDocument') {
    checkPoint(action.point);
    output = { x: (action.point.x - view.pan.x) / view.zoom, y: (action.point.y - view.pan.y) / view.zoom };
  } else if (action.type === 'pan') {
    checkPoint(action.delta);
    output = { zoom: view.zoom, pan: { x: view.pan.x + action.delta.x, y: view.pan.y + action.delta.y } };
  } else if (action.type === 'zoom') {
    checkPositive(action.factor);
    checkPoint(action.cursor);
    const zoom = Math.min(range.max, Math.max(range.min, view.zoom * action.factor));
    output = {
      zoom,
      pan: {
        x: action.cursor.x - (action.cursor.x - view.pan.x) / view.zoom * zoom,
        y: action.cursor.y - (action.cursor.y - view.pan.y) / view.zoom * zoom,
      },
    };
  } else throw new RangeError('Unknown view transform.');
  checkPoint('zoom' in output ? output.pan : output);
  return output as ViewOutput<T>;
}
