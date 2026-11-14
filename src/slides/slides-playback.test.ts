import { test } from 'node:test'; import assert from 'node:assert/strict'; import { JSDOM } from 'jsdom';
import { slidesDocument } from './slides-document.ts'; import { slidesPlayback } from './slides-playback.ts';
test('P03 presentation keyboard navigation closes and restores the original focus', () => {
  const dom = new JSDOM('<button id="opener">Present</button><div id="root"></div>', { pretendToBeVisual:true }), doc=dom.window.document;
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event('close'));};
  const opener=doc.getElementById('opener')!;opener.focus();const playback=slidesPlayback(doc.getElementById('root')!);
  let deck=slidesDocument({operation:'new',slideId:'s1'});deck=slidesDocument({operation:'edit',value:deck,action:{kind:'slide-add',id:'s2'}});
  playback.present(deck,'s1');const dialog=doc.querySelector('dialog')!;
  assert.match(dialog.textContent!,/1 of 2/);dialog.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));assert.match(dialog.textContent!,/2 of 2/);
  dialog.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));assert.match(dialog.textContent!,/1 of 2/);
  dialog.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(doc.querySelector('dialog'),null);assert.equal(doc.activeElement,opener);playback.dispose();
});
test('P03 print document has exact selected page geometry, safe title and one scene per slide', async () => {
  const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true}),doc=dom.window.document,playback=slidesPlayback(doc.getElementById('root')!);
  let deck=slidesDocument({operation:'new',slideId:'s1'});deck=slidesDocument({operation:'edit',value:deck,action:{kind:'canvas',width:960,height:720}});deck=slidesDocument({operation:'edit',value:deck,action:{kind:'slide-add',id:'s2'}});
  const pending=playback.print(deck,'<script>literal</script>'),frame=doc.querySelector<HTMLIFrameElement>('iframe.slides-print')!;
  assert.match(frame.srcdoc,/size: 10in 7.5in/);const printed=new JSDOM(frame.srcdoc).window.document;assert.equal(printed.querySelectorAll('.slides-scene').length,2);assert.equal(printed.querySelector('script'),null);assert.equal(printed.title,'<script>literal</script>');
  playback.dispose();await pending;assert.equal(doc.querySelector('iframe'),null);
});
