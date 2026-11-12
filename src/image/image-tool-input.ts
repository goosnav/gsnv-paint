/**
 * PURPOSE    Interpret Image canvas pointer input as paint and selection intents.
 * KIND       CORE
 * CONTRACT   IN: tool state, pointer event in document pixels (button 0 primary, 2 secondary, Shift, Ctrl),
 *            and a predicate telling whether a point lies inside the current selection (or floating pixels).
 *            OUT: owned next state plus one intent. Freehand tools emit incremental segments and one end;
 *            shapes/gradients/rectangle and ellipse selections preview on move and commit on release (Shift
 *            squares, circles and 45° lines; for selections Shift adds, Ctrl subtracts); lasso emits its path;
 *            a plain press inside the selection with a selection tool, or any press with Move, moves pixels;
 *            Ctrl-click with Clone sets the source; cancel abandons a drag.
 *            RAISES: TypeError for unknown tools or nonfinite points.
 * GUARANTEES Pure; never edits pixels; each drag ends in exactly one end/commit/cancel intent.
 * TUNING     None; screen-space thresholds belong to the caller.
 * DECISIONS  D1: Ctrl for subtract and clone source (GIMP convention) because the shared gesture carries
 *            Shift and Ctrl but not Alt. Revisit if: the input adapter exposes Alt.
 * LIMITS     Polygon lasso is freehand only (no click-to-add vertices).
 * TESTBENCH  src/image/image-tool-input.test.ts -- run with: node --import tsx --test src/image/image-tool-input.test.ts
 */
import type { Rect } from './raster-ops.ts';

export const IMAGE_TOOLS = ['move', 'select', 'ellipseSelect', 'lasso', 'wand', 'pencil', 'brush', 'airbrush', 'eraser', 'clone', 'blur', 'fill', 'gradient', 'picker', 'text', 'line', 'rectangle', 'ellipse'] as const;
export type ImageTool = typeof IMAGE_TOOLS[number];
export type SelectMode = 'replace' | 'add' | 'subtract';
type Point = [number, number];
type Drag = { mode: 'stroke' | 'shape' | 'marquee' | 'lasso' | 'move'; button: 0 | 2; start: Point; last: Point; points: Point[]; select: SelectMode };
export type ImageToolState = { tool: ImageTool; drag: Drag | null };
export type ImageIntent =
  | { kind: 'none' } | { kind: 'hover'; point: Point }
  | { kind: 'stroke'; points: Point[]; button: 0 | 2; first: boolean } | { kind: 'stroke-end' }
  | { kind: 'shape'; a: Point; b: Point; button: 0 | 2; commit: boolean }
  | { kind: 'fill' | 'pick' | 'text' | 'clone-source'; point: Point; button: 0 | 2 }
  | { kind: 'wand'; point: Point; mode: SelectMode }
  | { kind: 'marquee'; shape: 'rectangle' | 'ellipse' | 'polygon'; points: Point[]; mode: SelectMode; commit: boolean; drop: boolean }
  | { kind: 'move'; dx: number; dy: number; lift: boolean; commit: boolean }
  | { kind: 'cancel' };
type Request = {
  state: ImageToolState;
  event: { kind: 'down' | 'move' | 'up'; point: Point; button: 0 | 1 | 2; shift: boolean; ctrl?: boolean } | { kind: 'cancel' } | { kind: 'tool'; tool: ImageTool };
  inside: (point: Point) => boolean; floating: boolean;
};
const STROKE = new Set<ImageTool>(['pencil', 'brush', 'airbrush', 'eraser', 'clone', 'blur']);
const SHAPE = new Set<ImageTool>(['line', 'rectangle', 'ellipse', 'gradient']);
const MARQUEE = new Set<ImageTool>(['select', 'ellipseSelect', 'lasso']);

/** Whole-pixel rectangle covering both points, inclusive. */
export function pixelRect(a: Point, b: Point): Rect {
  const x0 = Math.floor(Math.min(a[0], b[0])), y0 = Math.floor(Math.min(a[1], b[1]));
  return { x: x0, y: y0, width: Math.floor(Math.max(a[0], b[0])) - x0 + 1, height: Math.floor(Math.max(a[1], b[1])) - y0 + 1 };
}

function constrain(tool: ImageTool, a: Point, b: Point, shift: boolean): Point {
  if (!shift) return b;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (tool === 'line' || tool === 'gradient') {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), length = Math.hypot(dx, dy);
    return [Math.round(a[0] + Math.cos(angle) * length), Math.round(a[1] + Math.sin(angle) * length)];
  }
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return [a[0] + Math.sign(dx || 1) * side, a[1] + Math.sign(dy || 1) * side];
}

export function imageToolInput({ state, event, inside, floating }: Request): { state: ImageToolState; intent: ImageIntent } {
  if (!IMAGE_TOOLS.includes(state?.tool)) throw new TypeError('Unknown image tool.');
  if ('point' in event && !event.point.every(Number.isFinite)) throw new TypeError('Pointer coordinates must be finite.');
  const none = { kind: 'none' } as const, tool = state.tool, drag = state.drag;
  if (event.kind === 'tool') {
    if (!IMAGE_TOOLS.includes(event.tool)) throw new TypeError('Unknown image tool.');
    return { state: { tool: event.tool, drag: null }, intent: drag ? { kind: 'cancel' } : none };
  }
  if (event.kind === 'cancel') return { state: { tool, drag: null }, intent: drag ? { kind: 'cancel' } : none };
  const p: Point = [event.point[0], event.point[1]], ctrl = !!event.ctrl;
  if (event.kind === 'down') {
    if (event.button === 1) return { state, intent: none };
    if (drag) return { state: { tool, drag: null }, intent: { kind: 'cancel' } };
    const button = event.button, select: SelectMode = event.shift ? 'add' : ctrl ? 'subtract' : 'replace';
    const begin = (mode: Drag['mode']) => ({ tool, drag: { mode, button, start: p, last: p, points: [p], select } });
    if (tool === 'move' || (MARQUEE.has(tool) && select === 'replace' && button === 0 && inside(p))) return { state: begin('move'), intent: { kind: 'move', dx: 0, dy: 0, lift: !floating, commit: false } };
    if (MARQUEE.has(tool)) return { state: begin(tool === 'lasso' ? 'lasso' : 'marquee'), intent: { kind: 'marquee', shape: tool === 'lasso' ? 'polygon' : tool === 'ellipseSelect' ? 'ellipse' : 'rectangle', points: [p], mode: select, commit: false, drop: floating } };
    if (tool === 'clone' && ctrl) return { state, intent: { kind: 'clone-source', point: p, button } };
    if (STROKE.has(tool)) return { state: begin('stroke'), intent: { kind: 'stroke', points: [p], button, first: true } };
    if (SHAPE.has(tool)) return { state: begin('shape'), intent: { kind: 'shape', a: p, b: p, button, commit: false } };
    if (tool === 'wand') return { state, intent: { kind: 'wand', point: p, mode: select } };
    return { state, intent: { kind: tool === 'fill' ? 'fill' : tool === 'picker' ? 'pick' : 'text', point: p, button } };
  }
  if (!drag) return { state, intent: event.kind === 'move' ? { kind: 'hover', point: p } : none };
  const done = event.kind === 'up', points = drag.mode === 'lasso' ? [...drag.points, p] : drag.points;
  const next: ImageToolState = { tool, drag: done ? null : { ...drag, last: p, points } };
  if (drag.mode === 'stroke') return { state: next, intent: done ? { kind: 'stroke-end' } : { kind: 'stroke', points: [drag.last, p], button: drag.button, first: false } };
  if (drag.mode === 'shape') return { state: next, intent: { kind: 'shape', a: drag.start, b: constrain(tool, drag.start, p, event.shift), button: drag.button, commit: done } };
  if (drag.mode === 'move') return { state: next, intent: { kind: 'move', dx: Math.round(p[0] - drag.start[0]), dy: Math.round(p[1] - drag.start[1]), lift: false, commit: done } };
  if (drag.mode === 'lasso') return { state: next, intent: { kind: 'marquee', shape: 'polygon', points, mode: drag.select, commit: done, drop: false } };
  const b = tool === 'ellipseSelect' || tool === 'select' ? (event.shift && drag.select === 'replace' ? constrain('rectangle', drag.start, p, true) : p) : p;
  const moved = Math.floor(b[0]) !== Math.floor(drag.start[0]) || Math.floor(b[1]) !== Math.floor(drag.start[1]);
  return { state: next, intent: { kind: 'marquee', shape: tool === 'ellipseSelect' ? 'ellipse' : 'rectangle', points: moved ? [drag.start, b] : [], mode: drag.select, commit: done, drop: false } };
}
