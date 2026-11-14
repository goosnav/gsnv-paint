import { test } from 'node:test'; import assert from 'node:assert/strict'; import { JSDOM } from 'jsdom';
import { slidesDocument, type SlidesAction } from './slides-document.ts'; import { slidesView } from './slides-view.ts';
function fixture() {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true }), root = dom.window.document.getElementById('root')!;
  let deck = slidesDocument({ operation: 'new', slideId: 's' }), selected: string | null = null; const actions: SlidesAction[] = [], commands: string[] = [], errors: string[] = [];
  deck = slidesDocument({ operation: 'edit', value: deck, action: { kind: 'element-add', slide: 's', id: 't', element: 'text' } });
  const view = slidesView({ root, onAction(action) { actions.push(action); deck = slidesDocument({ operation: 'edit', value: deck, action }); refresh(); }, onSelect(_s, id) { selected = id; refresh(); }, onCommand: c => commands.push(c), onError: e => errors.push(e) });
  function refresh() { view.update({ deck, slideId: 's', elementId: selected }); } refresh();
  const pointer = (node: Element, type: string, x: number, y: number) => node.dispatchEvent(Object.assign(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }), { pointerId: 1 }));
  return { dom, root, view, actions, commands, errors, pointer, refresh, get deck() { return deck; } };
}
test('P02 selection, text properties and numeric edits preserve focus across a real core update', () => {
  const f = fixture(); const text = f.root.querySelector<HTMLElement>('[data-element-id="t"]')!;
  text.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  const field = f.root.querySelector<HTMLTextAreaElement>('[data-field="text"]')!; field.focus(); field.value = 'Edited <script>literal</script>'; field.setSelectionRange(6, 6);
  field.dispatchEvent(new f.dom.window.Event('input', { bubbles: true })); assert.equal(f.actions.length, 0); f.view.flush();
  assert.equal(f.actions.length, 1); assert.equal(f.dom.window.document.activeElement, field); assert.equal(field.selectionStart, 6);
  assert.equal(f.root.querySelector('script'), null); assert.match(f.root.querySelector('[data-element-id="t"]')!.textContent!, /Edited/);
  const x = f.root.querySelector<HTMLInputElement>('[data-field="x"]')!; x.value = '125'; x.dispatchEvent(new f.dom.window.Event('input', { bubbles: true })); f.view.flush();
  assert.equal(f.deck.slides[0]!.elements[0]!.x, 125);
  x.value = ''; x.dispatchEvent(new f.dom.window.Event('input', { bubbles: true })); assert.throws(() => f.view.flush(), /number/i); assert.equal(f.deck.slides[0]!.elements[0]!.x, 125); assert.ok(f.errors.length);
  f.view.dispose(); assert.equal(f.root.childElementCount, 0);
});
test('P02 pointer move/resize previews commit once and cancellation restores original geometry', () => {
  const f = fixture(), surface = f.root.querySelector<HTMLElement>('[data-slides-surface]')!;
  surface.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 960, bottom: 540, width: 960, height: 540, toJSON() {} });
  f.pointer(f.root.querySelector('[data-element-id="t"]')!, 'pointerdown', 60, 60); f.pointer(surface, 'pointermove', 90, 80);
  assert.equal(f.actions.length, 0); assert.equal(f.root.querySelector<HTMLElement>('[data-element-id="t"]')!.style.left, '90px');
  f.pointer(surface, 'pointerup', 90, 80); assert.equal(f.actions.length, 1); assert.equal(f.deck.slides[0]!.elements[0]!.x, 90);
  f.pointer(f.root.querySelector('[data-resize]')!, 'pointerdown', 570, 200); f.pointer(surface, 'pointermove', 600, 220); f.pointer(surface, 'pointerup', 600, 220);
  assert.equal(f.actions.length, 2); assert.equal(f.deck.slides[0]!.elements[0]!.width, 510); assert.equal(f.deck.slides[0]!.elements[0]!.height, 140);
  f.pointer(f.root.querySelector('[data-element-id="t"]')!, 'pointerdown', 90, 80); f.pointer(surface, 'pointermove', 200, 200); f.pointer(surface, 'pointercancel', 200, 200);
  assert.equal(f.actions.length, 2); assert.equal(f.root.querySelector<HTMLElement>('[data-element-id="t"]')!.style.left, '90px'); f.view.dispose();
});
test('P02 keyboard move and command intents avoid text editing and reject invalid hosts', () => {
  const f = fixture(), element = f.root.querySelector<HTMLElement>('[data-element-id="t"]')!;
  element.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }));
  assert.equal(f.deck.slides[0]!.elements[0]!.x, 70);
  f.root.querySelector<HTMLButtonElement>('[data-slides-command="slides.add"]')!.click(); assert.deepEqual(f.commands, ['slides.add']);
  assert.throws(() => slidesView({ root: null as unknown as HTMLElement, onAction() {}, onSelect() {}, onCommand() {}, onError() {} }), TypeError); f.view.dispose();
});
test('P02 invalid pending domain values continue blocking save until corrected', () => {
  const f=fixture();f.root.querySelector('[data-element-id="t"]')!.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  const width=f.root.querySelector<HTMLInputElement>('[data-field="width"]')!;width.value='0';width.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));
  assert.throws(()=>f.view.flush(),/number/i);assert.throws(()=>f.view.flush(),/number/i);assert.equal(f.deck.slides[0]!.elements[0]!.width,480);
  width.value='320';width.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));f.view.flush();assert.equal(f.deck.slides[0]!.elements[0]!.width,320);f.view.dispose();
});
test('P02 a pointer selection takes keyboard focus so Escape cancels the active drag', () => {
  const f=fixture(),surface=f.root.querySelector<HTMLElement>('[data-slides-surface]')!;
  surface.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:960,bottom:540,width:960,height:540,toJSON(){}});
  f.root.querySelector<HTMLButtonElement>('[data-slides-command="slides.rectangle"]')!.focus();
  f.pointer(f.root.querySelector('[data-element-id="t"]')!,'pointerdown',60,60);f.pointer(surface,'pointermove',110,90);
  f.dom.window.document.activeElement!.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  f.pointer(surface,'pointerup',110,90);assert.equal(f.actions.length,0);assert.equal(f.deck.slides[0]!.elements[0]!.x,60);
  assert.equal((f.dom.window.document.activeElement as HTMLElement).dataset.elementId,'t');
  f.dom.window.document.activeElement!.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
  assert.equal(f.deck.slides[0]!.elements[0]!.x,61);f.view.dispose();
});
test('P02 unchanged host refresh preserves the active pointer preview and scene nodes', () => {
  const f=fixture(),surface=f.root.querySelector<HTMLElement>('[data-slides-surface]')!;
  surface.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:960,bottom:540,width:960,height:540,toJSON(){}});
  f.pointer(f.root.querySelector('[data-element-id="t"]')!,'pointerdown',60,60);f.pointer(surface,'pointermove',100,80);
  const preview=f.root.querySelector<HTMLElement>('[data-element-id="t"]')!;f.refresh();
  assert.equal(f.root.querySelector('[data-element-id="t"]'),preview);assert.equal(preview.style.left,'100px');
  f.pointer(surface,'pointerup',100,80);assert.equal(f.actions.length,1);assert.equal(f.deck.slides[0]!.elements[0]!.x,100);f.view.dispose();
});
test('P02 replacing a presentation restores equivalent property focus for the next shared shortcut', () => {
  const f=fixture();f.root.querySelector<HTMLInputElement>('[data-field="slideName"]')!.focus();
  f.view.update({deck:slidesDocument({operation:'new',slideId:'replacement'}),slideId:'replacement',elementId:null});
  assert.equal(f.dom.window.document.activeElement,f.root.querySelector('[data-field="slideName"]'));f.view.dispose();
});
