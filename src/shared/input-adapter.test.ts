import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { bindInput, type CommandContext, type Gesture } from './input-adapter.ts';

function fixture() {
  const dom = new JSDOM('<!doctype html><button id="outside">Outside</button><div data-target-id="outside"><main id="view" tabindex="0"><span id="shape" data-target-id="face-7"><b id="child">Face</b></span><input id="text"><button id="button">Button</button><select id="select"><option>A</option></select><div contenteditable="true"><span id="editable">Text</span></div></main></div>');
  const document = dom.window.document; const root = document.querySelector<HTMLElement>('#view')!;
  root.getBoundingClientRect = () => ({ left: 100, top: 50, right: 500, bottom: 350, x: 100, y: 50, width: 400, height: 300, toJSON() {} });
  const captured = new Set<number>(); const releases: number[] = [];
  root.setPointerCapture = id => { captured.add(id); };
  root.hasPointerCapture = id => captured.has(id);
  root.releasePointerCapture = id => { releases.push(id); captured.delete(id); pointer('lostpointercapture', { pointerId: id }); };
  let current: CommandContext = { workspace: 'image', target: 'view', viewRole: 'canvas2d', activeTool: 'brush', status: 'Draw' };
  const commands: string[] = []; const gestures: Gesture[] = [];
  const args = { root, context: () => current, onCommand: (id: string) => commands.push(id), onGesture: (value: Gesture) => gestures.push(value) };
  const element = (id: string) => document.querySelector<HTMLElement>(`#${id}`)!;
  function pointer(type: string, values: Record<string, unknown> = {}, target: HTMLElement = root) {
    const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 130, clientY: 90, button: 0, buttons: 1, ...values });
    for (const [name, value] of Object.entries({ pointerId: 1, pointerType: 'mouse', pressure: .5, ...values })) Object.defineProperty(event, name, { value });
    target.dispatchEvent(event); return event;
  }
  const key = (name: string, values: KeyboardEventInit = {}, target: HTMLElement = root) => {
    const event = new dom.window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...values }); target.dispatchEvent(event); return event;
  };
  const wheel = (deltaY: number, deltaMode = 0, target: HTMLElement = root) => {
    const event = new dom.window.WheelEvent('wheel', { clientX: 180, clientY: 110, deltaY, deltaMode, bubbles: true, cancelable: true }); target.dispatchEvent(event); return event;
  };
  return { dom, document, root, captured, releases, commands, gestures, args, pointer, key, wheel, element, set context(value: CommandContext) { current = value; }, get context() { return current; } };
}
const point = (phase: 'down' | 'move' | 'up' | 'cancel', changes = {}): Gesture => ({ type: 'pointer', phase, id: 1, point: { x: 30, y: 40 }, button: 0, ctrl: false, shift: false, pressure: phase === 'up' || phase === 'cancel' ? 0 : 1, ...changes });

test('S12 golden command and gesture transcript uses local coordinates and stable button identity', () => {
  const f = fixture(); bindInput(f.args);
  f.key('z', { ctrlKey: true }); f.pointer('pointerdown', { button: 1, ctrlKey: true, shiftKey: true });
  f.pointer('pointermove', { button: -1, clientX: 145, clientY: 105, ctrlKey: true }); f.pointer('pointerup', { button: -1 });
  f.wheel(-400); f.pointer('contextmenu', { button: 2 }, f.element('child'));
  assert.deepEqual(f.commands, ['edit.undo']);
  assert.deepEqual(f.gestures, [point('down', { button: 1, ctrl: true, shift: true }), point('move', { button: 1, ctrl: true, point: { x: 45, y: 55 } }), point('up', { button: 1 }),
    { type: 'wheel', cursor: { x: 80, y: 60 }, factor: 2 }, { type: 'context', point: { x: 30, y: 40 }, targetId: 'face-7' }]);
  assert.deepEqual([...f.captured], []); assert.deepEqual(f.releases, [1]);
});

test('S12 held Space pans 2D only and latches mode until release', () => {
  const f = fixture(); bindInput(f.args);
  assert.equal(f.key(' ').defaultPrevented, true); f.pointer('pointerdown');
  f.document.dispatchEvent(new f.dom.window.KeyboardEvent('keyup', { key: ' ', bubbles: true }));
  f.pointer('pointermove', { clientX: 150, clientY: 100 }); f.pointer('pointerup');
  assert.deepEqual(f.gestures, [{ type: 'pan', delta: { x: 20, y: 10 } }]); assert.deepEqual(f.commands, []);
  f.gestures.length = 0; f.pointer('pointerdown'); f.key(' '); f.pointer('pointermove'); f.pointer('pointerup');
  assert.deepEqual(f.gestures.map(value => value.type === 'pointer' && value.phase), ['down', 'move', 'up']);
});

test('S12 accessible view geometry still receives pointer, wheel and pan while ordinary buttons do not', () => {
  const f = fixture(); const shape=f.element('shape'); shape.setAttribute('role','button');shape.setAttribute('tabindex','0');shape.setAttribute('data-view-geometry','');bindInput(f.args);
  f.pointer('pointerdown',{},f.element('child'));f.pointer('pointerup',{},f.element('child'));
  f.wheel(-400,0,f.element('child'));
  assert.deepEqual(f.gestures.map(g=>g.type),['pointer','pointer','wheel']);
  f.gestures.length=0;f.key(' ');f.pointer('pointerdown',{},f.element('child'));f.pointer('pointermove',{clientX:150},f.element('child'));f.pointer('pointerup',{},f.element('child'));
  assert.deepEqual(f.gestures,[{type:'pan',delta:{x:20,y:0}}]);
  f.gestures.length=0;f.pointer('pointerdown',{},f.element('button'));f.wheel(-100,0,f.element('button'));assert.deepEqual(f.gestures,[]);
});

test('S12 preview/sketch Space pans while timeline Space plays once and CAD3D does not pan', () => {
  for (const viewRole of ['preview2d', 'sketch2d', 'timeline', 'cad3d'] as const) {
    const f = fixture(); f.context = { ...f.context, workspace: viewRole === 'timeline' ? 'video' : 'cad', viewRole }; bindInput(f.args);
    f.key(' '); f.key(' ', { repeat: true }); f.pointer('pointerdown'); f.pointer('pointermove', { clientX: 140 }); f.pointer('pointerup');
    assert.deepEqual(f.commands, viewRole === 'timeline' ? ['video.togglePlayback'] : []);
    assert.equal(f.gestures[0]?.type, ['preview2d', 'sketch2d'].includes(viewRole) ? 'pan' : 'pointer');
  }
});

test('S12 key repeats preserve undo/redo/delete/frame stepping and suppress repeated file/playback actions', () => {
  const f = fixture(); f.context = { ...f.context, workspace: 'video', viewRole: 'timeline' }; bindInput(f.args);
  f.key('s', { ctrlKey: true }); f.key('s', { ctrlKey: true, repeat: true });
  f.key('z', { ctrlKey: true, repeat: true }); f.key('z', { ctrlKey: true, shiftKey: true, repeat: true });
  f.key('Delete', { repeat: true }); f.key('ArrowRight', { repeat: true });
  assert.deepEqual(f.commands, ['file.save', 'edit.undo', 'edit.redo', 'edit.delete', 'video.stepForward']);
});

test('S12 native text, select, editable and button events preserve editing and activation', () => {
  const f = fixture(); bindInput(f.args);
  for (const id of ['text', 'select', 'editable', 'button']) {
    const target = f.element(id); target.focus();
    for (const name of id === 'button' ? [' ', 'Enter'] : [' ', 'Enter', 'x', 'Delete']) assert.equal(f.key(name, {}, target).defaultPrevented, false);
    f.pointer('pointerdown', {}, target); f.wheel(80, 0, target); f.pointer('contextmenu', {}, target);
  }
  assert.deepEqual(f.commands, []); assert.deepEqual(f.gestures, []);
  const text = f.element('text'); f.key('z', { ctrlKey: true }, text); f.key('c', { ctrlKey: true }, text); f.key('s', { ctrlKey: true }, text);
  assert.deepEqual(f.commands, ['file.save']);
});

test('S12 dialog ancestry blocks stale workspace shortcuts and consumed/IME events are ignored', () => {
  const f = fixture(); bindInput(f.args);
  const dialog = f.document.createElement('div'); dialog.setAttribute('role', 'dialog'); const input = f.document.createElement('input'); dialog.append(input); f.root.append(dialog);
  f.key('s', { ctrlKey: true }, input); f.key('Escape', {}, input); assert.deepEqual(f.commands, ['dialog.cancel']);
  f.key('z', { ctrlKey: true, isComposing: true });
  f.root.addEventListener('keydown', event => event.preventDefault(), { capture: true }); f.key('z', { ctrlKey: true });
  f.root.addEventListener('pointerdown', event => event.preventDefault(), { capture: true }); f.pointer('pointerdown');
  assert.deepEqual(f.commands, ['dialog.cancel']); assert.deepEqual(f.gestures, []);
});

test('S12 pressure and modifiers remain normalized; hover uses zero pressure', () => {
  for (const pressure of [-1, 0, .5, 1, 2]) {
    const f = fixture(); bindInput(f.args); f.pointer('pointerdown', { pointerType: 'pen', pressure, metaKey: true, shiftKey: true });
    assert.deepEqual(f.gestures, [point('down', { pressure: Math.min(1, Math.max(0, pressure)), ctrl: true, shift: true })]);
    f.pointer('pointercancel', { pointerType: 'pen', pressure }); assert.equal((f.gestures.at(-1) as { pressure: number }).pressure, 0);
  }
  const f = fixture(); bindInput(f.args); f.pointer('pointermove', { button: -1, pressure: 1 }); assert.deepEqual(f.gestures, [point('move', { pressure: 0 })]);
});

test('S12 capture loss cancels once and separate pointers do not cross-release', () => {
  const f = fixture(); bindInput(f.args); f.pointer('pointerdown'); f.pointer('pointerdown', { pointerId: 2, button: 2 });
  f.pointer('lostpointercapture'); f.pointer('pointerup'); f.pointer('pointerup', { pointerId: 2, button: -1 });
  assert.deepEqual(f.gestures.map(value => value.type === 'pointer' && [value.phase, value.id, value.button]), [['down', 1, 0], ['down', 2, 2], ['cancel', 1, 0], ['up', 2, 2]]);
  assert.equal(f.captured.size, 0);
});

for (const action of ['blur', 'focus', 'escape', 'dispose'] as const) test(`S12 ${action} cancels active tools and resets Space without duplicate endings`, () => {
  const f = fixture(); const dispose = bindInput(f.args); f.pointer('pointerdown');
  if (action === 'blur') f.dom.window.dispatchEvent(new f.dom.window.Event('blur'));
  if (action === 'focus') f.element('outside').focus();
  if (action === 'escape') f.key('Escape');
  if (action === 'dispose') dispose();
  f.pointer('pointerup'); dispose();
  assert.deepEqual(f.gestures.map(value => value.type === 'pointer' && value.phase), ['down', 'cancel']); assert.equal(f.captured.size, 0);
});

test('S12 wheel units, clamp and native scroll exceptions preserve finite factors', () => {
  const f = fixture(); bindInput(f.args);
  f.wheel(-25, 1); f.wheel(-1, 2); f.wheel(Number.MAX_VALUE); f.wheel(-Number.MAX_VALUE); f.wheel(0);
  assert.deepEqual(f.gestures, [
    { type: 'wheel', cursor: { x: 80, y: 60 }, factor: 2 },
    { type: 'wheel', cursor: { x: 80, y: 60 }, factor: 2 ** .75 },
    { type: 'wheel', cursor: { x: 80, y: 60 }, factor: 1 / 16 },
    { type: 'wheel', cursor: { x: 80, y: 60 }, factor: 16 },
  ]);
});

test('S12 context target never escapes root; pointer position can be outside captured view', () => {
  const f = fixture(); bindInput(f.args); f.pointer('contextmenu');
  f.pointer('pointerdown'); f.pointer('pointermove', { clientX: 20, clientY: 20 }); f.pointer('pointerup');
  assert.deepEqual(f.gestures[0], { type: 'context', point: { x: 30, y: 40 }, targetId: null });
  assert.deepEqual((f.gestures[2] as { point: unknown }).point, { x: -80, y: -30 });
});

test('S12 dispose removes listeners, restores touch-action and supports callback disposal', () => {
  const f = fixture(); f.root.style.touchAction = 'pan-y'; let dispose = () => {};
  dispose = bindInput({ ...f.args, onGesture: gesture => { f.gestures.push(gesture); if (gesture.type === 'pointer' && gesture.phase === 'down') dispose(); } });
  assert.equal(f.root.style.touchAction, 'none'); f.pointer('pointerdown'); dispose();
  f.key('s', { ctrlKey: true }); f.wheel(10); f.pointer('pointermove'); f.dom.window.dispatchEvent(new f.dom.window.Event('blur'));
  assert.deepEqual(f.gestures.map(value => value.type === 'pointer' && value.phase), ['down', 'cancel']);
  assert.deepEqual(f.commands, []); assert.equal(f.root.style.touchAction, 'pan-y'); assert.equal(f.captured.size, 0);
});

test('S12 viewRole none accepts commands without drawing gestures; stale text focus does not swallow view click', () => {
  const f = fixture(); f.context = { ...f.context, viewRole: 'none' }; bindInput(f.args);
  f.pointer('pointerdown'); f.wheel(10); f.key('s', { ctrlKey: true }); assert.deepEqual(f.gestures, []); assert.deepEqual(f.commands, ['file.save']);
  f.context = { ...f.context, target: 'text', viewRole: 'canvas2d' }; f.element('text').focus(); f.pointer('pointerdown');
  assert.equal(f.document.activeElement, f.root); assert.equal(f.gestures.length, 1);
});

test('S12 invalid ports/context/capture support raise TypeError before installing listeners', () => {
  const f = fixture();
  for (const patch of [{ root: null }, { context: null }, { onCommand: null }, { onGesture: null }, { context: () => ({ ...f.context, viewRole: 'bad' }) }, { context: () => ({ ...f.context, activeTool: '' }) }]) {
    assert.throws(() => bindInput({ ...f.args, ...patch } as Parameters<typeof bindInput>[0]), TypeError);
  }
  Object.defineProperty(f.root, 'setPointerCapture', { value: undefined }); assert.throws(() => bindInput(f.args), TypeError);
  f.key('s', { ctrlKey: true }); assert.deepEqual(f.commands, []);
});

for (const action of ['blur', 'focus', 'escape'] as const) test(`S12 held Space resets after ${action} so the next drag is a tool stroke`, () => {
  const f = fixture(); bindInput(f.args); f.key(' '); f.pointer('pointerdown'); f.pointer('pointermove', { clientX: 140 });
  if (action === 'blur') f.dom.window.dispatchEvent(new f.dom.window.Event('blur'));
  if (action === 'focus') f.element('outside').focus();
  if (action === 'escape') f.key('Escape');
  f.pointer('pointerdown'); f.pointer('pointermove'); f.pointer('pointerup');
  assert.deepEqual(f.gestures, [{ type: 'pan', delta: { x: 10, y: 0 } }, point('down'), point('move'), point('up')]);
});

test('S12 failed native capture surfaces the error and retains no pointer lifetime', () => {
  const f = fixture(); const expected = new Error('Capture unavailable'); const errors: unknown[] = [];
  f.root.setPointerCapture = () => { throw expected; };
  f.dom.window.addEventListener('error', event => { errors.push(event.error); event.preventDefault(); });
  const dispose = bindInput(f.args); f.pointer('pointerdown'); f.pointer('pointermove'); f.pointer('pointerup'); dispose();
  assert.deepEqual(errors, [expected]); assert.deepEqual(f.gestures, [point('move', { pressure: 0 })]); assert.equal(f.captured.size, 0); assert.deepEqual(f.releases, []);
});

for (const trigger of ['replacement', 'focus'] as const) test(`S12 disposal during ${trigger} cannot start a new pointer after cleanup`, () => {
  const f = fixture(); let dispose = () => {};
  dispose = bindInput({ ...f.args, onGesture: gesture => { f.gestures.push(gesture); if (trigger === 'replacement' && gesture.type === 'pointer' && gesture.phase === 'cancel') dispose(); } });
  if (trigger === 'focus') f.root.addEventListener('focus', () => dispose());
  f.pointer('pointerdown'); if (trigger === 'replacement') f.pointer('pointerdown');
  assert.deepEqual(f.gestures.map(value => value.type === 'pointer' && value.phase), trigger === 'replacement' ? ['down', 'cancel'] : []);
  assert.equal(f.captured.size, 0); f.wheel(10); assert.equal(f.commands.length, 0);
});

test('S12 context target uses hit testing when pointer capture retargets the native event', () => {
  const f = fixture(); bindInput(f.args);
  f.document.elementFromPoint = () => f.element('child');
  f.pointer('pointerdown', { button: 2 }); f.pointer('contextmenu', { button: 2 });
  assert.deepEqual(f.gestures.at(-1), { type: 'context', point: { x: 30, y: 40 }, targetId: 'face-7' });
  const count = f.gestures.length; f.document.elementFromPoint = () => f.element('outside');
  assert.equal(f.pointer('contextmenu', { button: 2 }).defaultPrevented, false); assert.equal(f.gestures.length, count);
});

test('S12 focused buttons preserve activation while routing document shortcuts', () => {
  const f = fixture(); bindInput(f.args); const button = f.element('button'); button.focus();
  f.key('z', { ctrlKey: true }, button); f.key('c', { ctrlKey: true }, button); f.key('Delete', {}, button);
  assert.deepEqual(f.commands, ['edit.undo', 'edit.copy', 'edit.delete']);
  assert.equal(f.key('Enter', {}, button).defaultPrevented, false); assert.equal(f.key(' ', {}, button).defaultPrevented, false);
});

test('S12 captured right-click over a native control or outside the view remains native', () => {
  const f = fixture(); bindInput(f.args);
  for (const target of [f.element('text'), f.element('button'), f.element('outside'), f.root.parentElement!]) {
    f.document.elementFromPoint = () => target;
    const event = f.pointer('contextmenu', { button: 2 });
    assert.equal(event.defaultPrevented, false); assert.deepEqual(f.gestures, []);
  }
});
