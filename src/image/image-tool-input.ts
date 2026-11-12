/**
 * PURPOSE    Interpret Image canvas pointer input as paint intents.
 * KIND       CORE
 * CONTRACT   IN: tool state, pointer event in document pixels (button 0 primary, 2 secondary),
 *            current rectangular selection and whether it is floating.
 *            OUT: owned next state plus one intent. Freehand tools emit incremental segments;
 *            shapes preview on move and commit on release; Shift squares rectangles/ellipses and
 *            snaps lines to 45°; a press inside the selection moves it; cancel abandons a drag.
 *            RAISES: TypeError for unknown tools or nonfinite points.
 * GUARANTEES Pure; never edits pixels; each drag ends in exactly one end/commit/cancel intent.
 * TUNING     None; screen-space thresholds belong to the caller.
 * DECISIONS  D1: Commit shapes on release (drag-to-size) as in classic paint programs, unlike
 *            CAD's click-click placement. Revisit if: precise numeric shape entry is required.
 * LIMITS     Rectangular selection only; text and colour sampling are single clicks.
 * TESTBENCH  src/image/image-tool-input.test.ts -- run with: node --import tsx --test src/image/image-tool-input.test.ts
 */
import type { Rect } from './raster-ops.ts';

export const IMAGE_TOOLS = ['select', 'pencil', 'brush', 'eraser', 'fill', 'picker', 'line', 'rectangle', 'ellipse', 'text'] as const;
export type ImageTool = typeof IMAGE_TOOLS[number];
type Point = [number, number];
type Drag = { mode: 'stroke' | 'shape' | 'marquee' | 'move'; button: 0 | 2; start: Point; last: Point };
export type ImageToolState = { tool: ImageTool; drag: Drag | null };
export type ImageIntent =
  | { kind: 'none' } | { kind: 'hover'; point: Point }
  | { kind: 'stroke'; points: Point[]; button: 0 | 2; first: boolean } | { kind: 'stroke-end' }
  | { kind: 'shape'; a: Point; b: Point; button: 0 | 2; commit: boolean }
  | { kind: 'fill' | 'pick' | 'text'; point: Point; button: 0 | 2 }
  | { kind: 'marquee'; rect: Rect | null; commit: boolean; drop: boolean }
  | { kind: 'move'; dx: number; dy: number; lift: boolean; commit: boolean }
  | { kind: 'cancel' };
type Request = {
  state: ImageToolState;
  event: { kind: 'down' | 'move' | 'up'; point: Point; button: 0 | 1 | 2; shift: boolean } | { kind: 'cancel' } | { kind: 'tool'; tool: ImageTool };
  selection: Rect | null; floating: boolean;
};

/** Whole-pixel rectangle covering both points, inclusive. */
export function pixelRect(a: Point, b: Point): Rect {
  const x0 = Math.floor(Math.min(a[0], b[0])), y0 = Math.floor(Math.min(a[1], b[1]));
  return { x: x0, y: y0, width: Math.floor(Math.max(a[0], b[0])) - x0 + 1, height: Math.floor(Math.max(a[1], b[1])) - y0 + 1 };
}

function constrain(tool: ImageTool, a: Point, b: Point, shift: boolean): Point {
  if (!shift) return b;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (tool === 'line') {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), length = Math.hypot(dx, dy);
    return [Math.round(a[0] + Math.cos(angle) * length), Math.round(a[1] + Math.sin(angle) * length)];
  }
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return [a[0] + Math.sign(dx || 1) * side, a[1] + Math.sign(dy || 1) * side];
}

export function imageToolInput({ state, event, selection, floating }: Request): { state: ImageToolState; intent: ImageIntent } {
  if (!IMAGE_TOOLS.includes(state?.tool)) throw new TypeError('Unknown image tool.');
  if ('point' in event && !event.point.every(Number.isFinite)) throw new TypeError('Pointer coordinates must be finite.');
  const none = { kind: 'none' } as const, tool = state.tool, drag = state.drag;
  if (event.kind === 'tool') {
    if (!IMAGE_TOOLS.includes(event.tool)) throw new TypeError('Unknown image tool.');
    return { state: { tool: event.tool, drag: null }, intent: drag ? { kind: 'cancel' } : none };
  }
  if (event.kind === 'cancel') return { state: { tool, drag: null }, intent: drag ? { kind: 'cancel' } : none };
  const p: Point = [event.point[0], event.point[1]];
  if (event.kind === 'down') {
    if (event.button === 1) return { state, intent: none };
    const button = event.button, begin = (mode: Drag['mode']) => ({ tool, drag: { mode, button, start: p, last: p } });
    if (drag) return { state: { tool, drag: null }, intent: { kind: 'cancel' } };
    if (tool === 'select') {
      const inside = selection && p[0] >= selection.x && p[1] >= selection.y && p[0] < selection.x + selection.width && p[1] < selection.y + selection.height;
      if (inside && button === 0) return { state: begin('move'), intent: { kind: 'move', dx: 0, dy: 0, lift: !floating, commit: false } };
      return { state: begin('marquee'), intent: { kind: 'marquee', rect: null, commit: false, drop: floating } };
    }
    if (tool === 'pencil' || tool === 'brush' || tool === 'eraser') return { state: begin('stroke'), intent: { kind: 'stroke', points: [p], button, first: true } };
    if (tool === 'line' || tool === 'rectangle' || tool === 'ellipse') return { state: begin('shape'), intent: { kind: 'shape', a: p, b: p, button, commit: false } };
    return { state, intent: { kind: tool === 'fill' ? 'fill' : tool === 'picker' ? 'pick' : 'text', point: p, button } };
  }
  if (!drag) return { state, intent: event.kind === 'move' ? { kind: 'hover', point: p } : none };
  const done = event.kind === 'up', next: ImageToolState = { tool, drag: done ? null : { ...drag, last: p } };
  if (drag.mode === 'stroke') return { state: next, intent: done ? { kind: 'stroke-end' } : { kind: 'stroke', points: [drag.last, p], button: drag.button, first: false } };
  if (drag.mode === 'shape') return { state: next, intent: { kind: 'shape', a: drag.start, b: constrain(tool, drag.start, p, event.shift), button: drag.button, commit: done } };
  if (drag.mode === 'move') return { state: next, intent: { kind: 'move', dx: Math.round(p[0] - drag.start[0]), dy: Math.round(p[1] - drag.start[1]), lift: false, commit: done } };
  const rect = pixelRect(drag.start, p), moved = Math.floor(p[0]) !== Math.floor(drag.start[0]) || Math.floor(p[1]) !== Math.floor(drag.start[1]);
  return { state: next, intent: { kind: 'marquee', rect: moved ? rect : null, commit: done, drop: false } };
}
