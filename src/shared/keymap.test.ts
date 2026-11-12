import assert from 'node:assert/strict';
import test from 'node:test';
import { keymap, type CommandEvent } from './keymap.ts';

const base: CommandEvent = { key: '', ctrl: false, meta: false, shift: false, alt: false, target: 'view', workspace: 'cad', viewRole: 'cad3d' };
const mapped = (key: string, change: Partial<CommandEvent> = {}) => keymap({ ...base, key, ...change });
const handled = (command: string) => ({ command, preventDefault: true });
const unhandled = { command: null, preventDefault: false };

test('S05 golden shortcut transcript', () => {
  assert.deepEqual([
    mapped('z', { ctrl: true }), mapped('Z', { ctrl: true, shift: true }),
    mapped(' ', { workspace: 'video', viewRole: 'timeline' }),
    mapped(' ', { workspace: 'video', viewRole: 'preview2d' }),
    mapped('x', { workspace: 'image', viewRole: 'canvas2d', target: 'text' }),
  ], [handled('edit.undo'), handled('edit.redo'), handled('video.togglePlayback'), handled('view.panHold'), unhandled]);
});

test('S05 complete common Ctrl/Meta table across all workspaces', () => {
  for (const workspace of ['cad', 'image', 'video'] as const) {
    for (const modifier of ['ctrl', 'meta'] as const) {
      for (const [key, command] of Object.entries({ n: 'file.new', o: 'file.open', s: 'file.save', z: 'edit.undo', y: 'edit.redo', c: 'edit.copy', x: 'edit.cut', v: 'edit.paste', a: 'edit.selectAll' })) {
        assert.deepEqual(mapped(key, { workspace, [modifier]: true }), handled(command));
        assert.deepEqual(mapped(key.toUpperCase(), { workspace, [modifier]: true }), handled(command));
      }
      assert.deepEqual(mapped('z', { workspace, [modifier]: true, shift: true }), handled('edit.redo'));
    }
    assert.deepEqual(mapped('Delete', { workspace }), handled('edit.delete'));
    assert.deepEqual(mapped('Escape', { workspace }), handled('tool.cancel'));
    assert.deepEqual(mapped('Enter', { workspace }), handled('tool.confirm'));
  }
});

test('S05 ordinary text editing stays native; document file shortcuts still work', () => {
  for (const workspace of ['cad', 'image', 'video'] as const) {
    for (const key of ['z', 'y', 'c', 'x', 'v', 'a', 'ArrowLeft', 'Home', 'End', 'Delete', 'Enter', ' ']) {
      for (const ctrl of [false, true]) assert.deepEqual(mapped(key, { target: 'text', workspace, ctrl }), unhandled);
    }
    for (const [key, command] of [['s', 'file.save'], ['o', 'file.open'], ['n', 'file.new']] as const) {
      assert.deepEqual(mapped(key, { target: 'text', workspace, ctrl: true }), handled(command));
    }
  }
});

test('S05 dialogs map Enter and Escape and shield workspace commands', () => {
  assert.deepEqual(mapped('Enter', { target: 'dialog' }), handled('dialog.confirm'));
  assert.deepEqual(mapped('Escape', { target: 'dialog' }), handled('dialog.cancel'));
  for (const key of [' ', 'Delete', 's', 'z', 'x', 'j']) {
    for (const ctrl of [false, true]) assert.deepEqual(mapped(key, { target: 'dialog', ctrl }), unhandled);
  }
});

test('S05 Space pans every 2D view but plays only a Video timeline', () => {
  for (const workspace of ['cad', 'image', 'video'] as const) {
    for (const viewRole of ['canvas2d', 'preview2d', 'sketch2d'] as const) {
      assert.deepEqual(mapped(' ', { workspace, viewRole }), handled('view.panHold'));
    }
    for (const viewRole of ['cad3d', 'none'] as const) assert.deepEqual(mapped(' ', { workspace, viewRole }), unhandled);
  }
  assert.deepEqual(mapped(' ', { workspace: 'video', viewRole: 'timeline' }), handled('video.togglePlayback'));
  assert.deepEqual(mapped(' ', { workspace: 'cad', viewRole: 'timeline' }), unhandled);
});

test('S05 complete Video timeline table is limited to the focused timeline', () => {
  const keys = { s: 'video.split', j: 'video.shuttleReverse', k: 'video.pause', l: 'video.shuttleForward',
    ArrowLeft: 'video.stepBack', ArrowRight: 'video.stepForward', i: 'video.markIn', o: 'video.markOut', Home: 'video.home', End: 'video.end' };
  for (const [key, command] of Object.entries(keys)) {
    assert.deepEqual(mapped(key, { workspace: 'video', viewRole: 'timeline' }), handled(command));
    assert.deepEqual(mapped(key, { workspace: 'video', viewRole: 'preview2d' }), unhandled);
    assert.notEqual(mapped(key, { workspace: 'image', viewRole: 'canvas2d' }).command, command);
  }
});

test('S05 complete Image tool/color table is workspace-specific', () => {
  const keys = { x: 'color.swap', d: 'color.reset', s: 'image.select', p: 'image.pencil', b: 'image.brush', e: 'image.eraser', g: 'image.fill',
    i: 'image.picker', l: 'image.line', r: 'image.rectangle', o: 'image.ellipse', t: 'image.text', f: 'view.fit' };
  for (const [key, command] of Object.entries(keys)) {
    assert.deepEqual(mapped(key, { workspace: 'image', viewRole: 'canvas2d' }), handled(command));
    if (key !== 'f') assert.notEqual(mapped(key).command, command);
  }
  for (const key of ['x', 'd']) assert.deepEqual(mapped(key), unhandled);
  assert.deepEqual(mapped('f'), handled('view.fit'));
  assert.deepEqual(mapped('q', { workspace: 'image', viewRole: 'canvas2d' }), unhandled);
});

test('S05 unspecified modifier combinations and unknown keys are untouched', () => {
  for (const key of ['s', ' ', 'Enter', 'Delete', 'x', 'f']) {
    assert.deepEqual(mapped(key, { alt: true }), unhandled);
    assert.deepEqual(mapped(key, { shift: true }), unhandled);
    assert.deepEqual(mapped(key, { ctrl: true, shift: true }), unhandled);
  }
  for (const key of ['Tab', 'F1', 'q', 'Unidentified']) assert.deepEqual(mapped(key), unhandled);
});

test('S05 output property: only handled commands request preventDefault; input stays frozen', () => {
  for (const key of ['n', 'z', ' ', 'Enter', 'f', 'x', 'q']) {
    for (const ctrl of [false, true]) {
      const event = Object.freeze({ ...base, key, ctrl });
      const result = keymap(event);
      assert.equal(result.preventDefault, result.command !== null);
      assert.equal(event.key, key);
    }
  }
});

for (const [index, patch] of [
  { key: '' }, { key: null }, { key: 5 }, { workspace: 'sound' }, { target: 'button' }, { viewRole: 'unknown' },
  { ctrl: 1 }, { meta: undefined }, { shift: 'true' }, { alt: null },
].entries()) test(`S05 malformed event ${index} raises TypeError`, () => {
  assert.throws(() => keymap({ ...base, ...patch } as CommandEvent), TypeError);
});

test('S05 production CAD tool shortcuts stay native while typing',()=>{
 for(const [key,command] of Object.entries({v:'cad.select',l:'cad.line',r:'cad.rectangleTool',e:'cad.extrude'})){
  assert.deepEqual(mapped(key),handled(command));assert.deepEqual(mapped(key,{target:'text'}),unhandled);
 }
});
