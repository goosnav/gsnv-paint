/**
 * PURPOSE    Normalize browser input for the active workspace.
 * KIND       SHELL
 * CONTRACT   IN: live root, context and command/gesture callbacks. Root is the event
 *            scope and CSS-coordinate origin; callers bind each editable view.
 *            OUT: idempotent disposer. S05 routes keys; consumed/IME input is ignored.
 *            Native controls/editable/dialog ancestry overrides stale focus context.
 *            Space's panHold is internal; 2D pan emits deltas only and is latched at
 *            left pointerdown. Other pointers emit down/move/up/cancel with initiating
 *            button, Ctrl/Meta selection flag, Shift and normalized pressure. Hover
 *            is button 0/pressure 0; mouse presses use pressure 1; pen/touch clamp [0,1].
 *            Wheel emits local cursor and finite positive factor; context target is
 *            nearest in-root data-target-id or null. Escape, focus departure, blur,
 *            lost capture and disposal cancel active pointers exactly once. Keyup
 *            clears Space even outside root. Native touch gestures are disabled on
 *            root for this lifetime; its previous touch-action is restored on dispose.
 *            RAISES: TypeError for invalid ports/context or missing capture support.
 * GUARANTEES No domain decisions, document edits or invented pan-release command.
 *            Pan never emits a drawing stroke; native text editing remains native.
 * TUNING     WHEEL_PIXELS_PER_DOUBLE=400 (>0), LINE_PIXELS=16 (>0), MAX_EXPONENT=4
 *            (>0); wheel conversion and repeatable-command set have explicit tests.
 * DECISIONS  D1: Latch input mode per pointer. Alternative: switch on every move;
 *            rejected because releasing Space could draw without a tool down.
 *            Revisit if: the gesture contract gains explicit mode transitions.
 *            D2: Consume panHold internally. Alternative: invent a release command;
 *            rejected because the approved seam represents pan as deltas only.
 *            Revisit if: a consumer needs an explicit gesture-state display seam.
 * LIMITS     Root must carry the appropriate view context; viewRole=none has keys
 *            only. Domain snapping, cameras, transforms and context-menu rendering
 *            are external. Context/callback/native capture exceptions propagate;
 *            failed capture emits no tool down and retains no active pointer.
 * TESTBENCH  src/shared/input-adapter.test.ts -- run with: node --import tsx --test src/shared/input-adapter.test.ts
 */

import { keymap, type CommandEvent } from './keymap.ts';
export type CommandContext = Pick<CommandEvent, 'workspace' | 'target' | 'viewRole'> & { activeTool: string; status: string };
type Point = { x: number; y: number };
export type Gesture =
  | { type: 'pointer'; phase: 'down' | 'move' | 'up' | 'cancel'; id: number; point: Point; button: 0 | 1 | 2; ctrl: boolean; shift: boolean; pressure: number }
  | { type: 'wheel'; cursor: Point; factor: number }
  | { type: 'pan'; delta: Point }
  | { type: 'context'; point: Point; targetId: string | null };
type InputRequest = { root: HTMLElement; context(): CommandContext; onCommand(id: string): void; onGesture(gesture: Gesture): void };
const WHEEL_PIXELS_PER_DOUBLE = 400;
const LINE_PIXELS = 16;
const MAX_EXPONENT = 4;
const TWO_DIMENSIONAL = new Set(['preview2d', 'canvas2d', 'sketch2d']);
const REPEATABLE = new Set(['edit.undo', 'edit.redo', 'edit.delete', 'video.stepBack', 'video.stepForward', 'image.sizeDown', 'image.sizeUp', 'image.nudgeLeft', 'image.nudgeRight', 'image.nudgeUp', 'image.nudgeDown']);
type PointerState = { id: number; button: 0 | 1 | 2; point: Point; ctrl: boolean; shift: boolean; pan: boolean };

export function bindInput({ root, context, onCommand, onGesture }: InputRequest): () => void {
  if (!root?.ownerDocument?.defaultView || root.nodeType !== 1 || !root.isConnected ||
      [context, onCommand, onGesture, root.setPointerCapture, root.releasePointerCapture, root.hasPointerCapture].some(port => typeof port !== 'function')) throw new TypeError('Input needs a live root, pointer capture and callbacks.');
  const document = root.ownerDocument; const window = document.defaultView!;
  const getContext = () => {
    const value = context();
    if (!value || typeof value.activeTool !== 'string' || !value.activeTool || typeof value.status !== 'string') throw new TypeError('Input context needs an active tool and status text.');
    keymap({ ...value, key: 'Unidentified', ctrl: false, meta: false, shift: false, alt: false });
    return value;
  };
  getContext();
  const originalTouchAction = root.style.touchAction; root.style.touchAction = 'none';
  const active = new Map<number, PointerState>(); let space = false; let disposed = false;
  const element = (target: EventTarget | null): Element | null => {
    const node = target as Node | null; return node?.nodeType === 1 ? node as Element : node?.parentElement ?? null;
  };
  const inDialog = (target: Element | null) => Boolean(target?.closest('dialog[open],[role="dialog"],[aria-modal="true"]'));
  const textEntry = (target: Element | null) => {
    const editable = target?.closest('[contenteditable]');
    return Boolean(target?.closest('input,textarea,select,[role="textbox"]') ||
      (editable && editable.getAttribute('contenteditable') !== 'false'));
  };
  const activationControl = (target: Element | null) => Boolean(target?.closest('button,a[href],[role="button"]'));
  const interactive = (target: Element | null) => textEntry(target) || activationControl(target);
  const position = (event: MouseEvent): Point => { const rect = root.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
  const finite = (point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y);
  const release = (id: number) => {
    if (!root.hasPointerCapture(id)) return;
    try { root.releasePointerCapture(id); }
    catch (cause) { if (root.hasPointerCapture(id)) throw cause; }
  };
  const emit = (state: PointerState, phase: 'down' | 'move' | 'up' | 'cancel', pressure = 0) => {
    if (!state.pan) onGesture({ type: 'pointer', phase, id: state.id, point: { ...state.point }, button: state.button, ctrl: state.ctrl, shift: state.shift, pressure });
  };
  const end = (id: number, phase: 'up' | 'cancel') => {
    const state = active.get(id); if (!state) return;
    active.delete(id); release(id); emit(state, phase);
  };
  const cancelAll = () => {
    space = false;
    const states = [...active.values()]; active.clear();
    let failed = false; let failure: unknown;
    for (const state of states) {
      try { release(state.id); emit(state, 'cancel'); }
      catch (cause) { if (!failed) { failed = true; failure = cause; } }
    }
    if (failed) throw failure;
  };
  const inputView = (event: Event, value: CommandContext) => !disposed && !event.defaultPrevented && value.target !== 'dialog' && value.viewRole !== 'none' && !inDialog(element(event.target)) && !interactive(element(event.target));
  const pressure = (event: PointerEvent) => event.pointerType === 'mouse' || !event.pointerType ? 1 : Number.isFinite(event.pressure) ? Math.max(0, Math.min(1, event.pressure)) : 0;
  const down = (event: PointerEvent) => {
    if (disposed || event.defaultPrevented || ![0, 1, 2].includes(event.button)) return;
    const value = getContext(); if (!inputView(event, value)) return;
    const point = position(event); if (!finite(point)) return;
    end(event.pointerId, 'cancel');
    if (disposed) return;
    root.focus({ preventScroll: true });
    if (disposed) return;
    const state: PointerState = { id: event.pointerId, button: event.button as 0 | 1 | 2, point, ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, pan: space && event.button === 0 && TWO_DIMENSIONAL.has(value.viewRole) };
    root.setPointerCapture(event.pointerId);
    // Native focus/capture events can dispose this adapter while setup is running.
    if (disposed) { release(event.pointerId); return; }
    active.set(event.pointerId, state);
    event.preventDefault(); emit(state, 'down', pressure(event));
  };
  const moved = (event: PointerEvent) => {
    if (disposed || event.defaultPrevented) return;
    const point = position(event); if (!finite(point)) return;
    const state = active.get(event.pointerId);
    if (!state) {
      if (!inputView(event, getContext())) return;
      event.preventDefault(); emit({ id: event.pointerId, button: 0, point, ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, pan: false }, 'move'); return;
    }
    const delta = { x: point.x - state.point.x, y: point.y - state.point.y };
    state.point = point; state.ctrl = event.ctrlKey || event.metaKey; state.shift = event.shiftKey; event.preventDefault();
    if (state.pan) { if (delta.x || delta.y) onGesture({ type: 'pan', delta }); }
    else emit(state, 'move', pressure(event));
  };
  const ended = (event: PointerEvent) => {
    const state = active.get(event.pointerId); if (disposed || !state) return;
    const point = position(event); if (finite(point)) state.point = point;
    state.ctrl = event.ctrlKey || event.metaKey; state.shift = event.shiftKey;
    event.preventDefault(); end(event.pointerId, event.type === 'pointerup' ? 'up' : 'cancel');
  };
  const lost = (event: PointerEvent) => { if (!disposed) end(event.pointerId, 'cancel'); };
  const keyed = (event: KeyboardEvent) => {
    if (disposed || event.defaultPrevented || event.isComposing) return;
    const value = getContext(); const target = element(event.target);
    if (disposed) return;
    if (activationControl(target) && [' ', 'Enter'].includes(event.key)) return;
    const focus = inDialog(target) ? 'dialog' : textEntry(target) ? 'text' : activationControl(target) && value.target !== 'dialog' ? 'view' : value.target;
    const result = keymap({ ...value, target: focus, key: event.key, ctrl: event.ctrlKey, meta: event.metaKey, shift: event.shiftKey, alt: event.altKey });
    if (!result.command) return;
    if (result.preventDefault) event.preventDefault();
    if (result.command === 'view.panHold') { space = true; return; }
    if (event.repeat && !REPEATABLE.has(result.command)) return;
    if (result.command === 'tool.cancel') cancelAll();
    if (!disposed) onCommand(result.command);
  };
  const keyup = (event: KeyboardEvent) => { if (event.key === ' ') space = false; };
  const focusChanged = (event: FocusEvent) => {
    const target = element(event.target);
    if (!target || !root.contains(target) || inDialog(target) || interactive(target)) cancelAll();
  };
  const wheel = (event: WheelEvent) => {
    if (disposed || event.defaultPrevented || !Number.isFinite(event.deltaY) || event.deltaY === 0 || ![0, 1, 2].includes(event.deltaMode)) return;
    if (!inputView(event, getContext())) return;
    const cursor = position(event); if (!finite(cursor)) return;
    const unit = event.deltaMode === 1 ? LINE_PIXELS : event.deltaMode === 2 ? Math.max(root.getBoundingClientRect().height, 1) : 1;
    const exponent = Math.max(-MAX_EXPONENT, Math.min(MAX_EXPONENT, -event.deltaY * unit / WHEEL_PIXELS_PER_DOUBLE));
    event.preventDefault(); onGesture({ type: 'wheel', cursor, factor: 2 ** exponent });
  };
  const contextMenu = (event: MouseEvent) => {
    if (disposed || event.defaultPrevented || !inputView(event, getContext())) return;
    const point = position(event); if (!finite(point)) return;
    // Pointer capture retargets right-click events; hit-test the item under the cursor.
    const hit = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(event.clientX, event.clientY) : element(event.target);
    if (!hit || !root.contains(hit) || inDialog(hit) || interactive(hit)) return;
    const target = hit?.closest('[data-target-id]');
    event.preventDefault(); onGesture({ type: 'context', point, targetId: target && root.contains(target) ? target.getAttribute('data-target-id') || null : null });
  };
  root.addEventListener('keydown', keyed); root.addEventListener('pointerdown', down);
  root.addEventListener('pointermove', moved); root.addEventListener('pointerup', ended); root.addEventListener('pointercancel', ended);
  root.addEventListener('lostpointercapture', lost); root.addEventListener('wheel', wheel, { passive: false }); root.addEventListener('contextmenu', contextMenu);
  document.addEventListener('keyup', keyup); document.addEventListener('focusin', focusChanged); window.addEventListener('blur', cancelAll);
  return () => {
    if (disposed) return; disposed = true;
    root.removeEventListener('keydown', keyed); root.removeEventListener('pointerdown', down);
    root.removeEventListener('pointermove', moved); root.removeEventListener('pointerup', ended); root.removeEventListener('pointercancel', ended);
    root.removeEventListener('lostpointercapture', lost); root.removeEventListener('wheel', wheel); root.removeEventListener('contextmenu', contextMenu);
    document.removeEventListener('keyup', keyup); document.removeEventListener('focusin', focusChanged); window.removeEventListener('blur', cancelAll);
    root.style.touchAction = originalTouchAction; cancelAll();
  };
}
