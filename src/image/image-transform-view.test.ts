import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { imageTransformView } from './image-transform-view.ts';
test('transform handles track zoom and typed controls apply one validated box',()=>{
 const dom=new JSDOM('<main></main>'),root=dom.window.document.querySelector('main')!;let begun=0,applied=0,cancelled=0,changes:any[]=[],errors:unknown[]=[];
 const control=imageTransformView({root,onBegin(){begun++;},onChange(box){changes.push(box);},onApply(){applied++;},onCancel(){cancelled++;},onError(cause){errors.push(cause);}});
 assert.equal(root.querySelector('[aria-label="Transform sampling"]'),null,'geometry-only consumers do not offer a nonfunctional sampler');
 const box={x:10,y:20,width:100,height:50,angle:0};control.update({box,active:true,view:{x:5,y:8,zoom:2}});
 assert.equal(root.querySelectorAll('[data-transform-handle]').length,10);assert.equal(root.querySelector<HTMLElement>('.image-transform-box')!.style.width,'200px');
 const width=root.querySelector<HTMLInputElement>('[aria-label="Transform width"]')!;width.value='200';width.dispatchEvent(new dom.window.Event('change'));assert.equal(begun,1);assert.equal(changes[0].width,200);
 width.value='0';width.dispatchEvent(new dom.window.Event('change'));assert.equal(errors.length,1);assert.equal(changes.length,1);
 root.querySelector<HTMLButtonElement>('[aria-label="Apply transform"]')!.click();assert.equal(applied,0);width.value='200';root.querySelector<HTMLButtonElement>('[aria-label="Apply transform"]')!.click();assert.equal(applied,1);
 root.querySelector<HTMLButtonElement>('[aria-label="Cancel transform"]')!.click();assert.equal(cancelled,1);
 control.update(null);assert.equal(root.querySelector<HTMLElement>('.image-transform-box')!.hidden,true);control.dispose();assert.equal(root.children.length,0);dom.window.close();
});

test('I61 transform sampling is explicit, preview-only and disposed with its controls', () => {
 const dom=new JSDOM('<main></main>'),root=dom.window.document.querySelector('main')!;const samples:string[]=[];let begun=0,applied=0;
 const control=imageTransformView({root,onBegin(){begun++;},onChange(){},onApply(){applied++;},onCancel(){},onError(cause){throw cause;},onSampling(value){samples.push(value);}});
 control.update({box:{x:0,y:0,width:10,height:10,angle:0},active:true,view:{x:0,y:0,zoom:1},sampling:'nearest'});
 const sampler=root.querySelector<HTMLSelectElement>('[aria-label="Transform sampling"]')!;assert.equal(sampler.value,'nearest');
 sampler.value='bilinear';sampler.dispatchEvent(new dom.window.Event('change'));assert.deepEqual(samples,['bilinear']);assert.equal(begun,0);assert.equal(applied,0);
 control.dispose();sampler.dispatchEvent(new dom.window.Event('change'));assert.deepEqual(samples,['bilinear']);dom.window.close();
});
