import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { imageNavigator } from './image-navigator.ts';
function setup() {
 const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
 const {document} = dom.window; Object.assign(dom.window.HTMLCanvasElement.prototype, { getContext: () => ({clearRect(){}, drawImage(){}}) });
 const root = document.querySelector<HTMLElement>('#root')!, zoom: number[] = [], centers: {x:number;y:number}[] = []; let fit = 0;
 const nav = imageNavigator({root, onZoom: value => zoom.push(value), onCenter: value => centers.push(value), onFit: () => fit++});
 const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
 const state = {image: canvas, revision: {}, view: {x: -200, y: -100, zoom: 2}, viewport: {width: 400, height: 300}};
 return {dom,root,nav,state,zoom,centers,get fit(){return fit;}, close(){nav.dispose();dom.window.close();}};
}
test('navigator reflects view, zooms without editing and accepts a typed percent', () => {
 const s = setup(); s.nav.update(s.state); assert.equal(s.root.querySelector<HTMLElement>('.image-navigator')!.hidden, false);
 const percent = s.root.querySelector<HTMLInputElement>('input[type=number]')!; assert.equal(percent.value, '200');
 s.root.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click(); assert.equal(s.zoom.at(-1), 2.5);
 percent.value = '6400'; percent.dispatchEvent(new s.dom.window.Event('change')); assert.equal(s.zoom.at(-1), 64);
 percent.value = '0'; percent.dispatchEvent(new s.dom.window.Event('change')); assert.equal(percent.getAttribute('aria-invalid'), 'true'); assert.equal(s.zoom.length, 2);
 const frame = s.root.querySelector<HTMLElement>('.navigator-frame')!; assert.ok(Math.abs(parseFloat(frame.style.width) - 200 * 88 / 600) < .001); // Height-constrained preview preserves the image aspect ratio
 s.root.querySelector<HTMLButtonElement>('[aria-label="Fit image"]')!.click(); assert.equal(s.fit, 1);
 s.nav.update(null); assert.equal(s.root.querySelector<HTMLElement>('.image-navigator')!.hidden, true); s.close();
});
test('navigator slider and keyboard map controls are bounded and disposed', () => {
 const s = setup(); s.nav.update(s.state); const range = s.root.querySelector<HTMLInputElement>('input[type=range]')!;
 range.value = '0'; range.dispatchEvent(new s.dom.window.Event('input')); assert.equal(s.zoom.at(-1), .01);
 range.value = '1000'; range.dispatchEvent(new s.dom.window.Event('input')); assert.equal(s.zoom.at(-1), 64);
 const map = s.root.querySelector<HTMLButtonElement>('.navigator-map')!; map.dispatchEvent(new s.dom.window.KeyboardEvent('keydown', {key:'ArrowRight',bubbles:true}));
 assert.deepEqual(s.centers.at(-1), {x:220,y:125}); s.nav.dispose(); assert.equal(s.root.children.length, 0); s.close();
});
