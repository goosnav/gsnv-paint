import {test} from 'node:test';
import assert from 'node:assert/strict';
// Exact characterization cases retained across the print-layout extraction.
import {pageCss,pageInches,DEFAULT_PAGE} from './document-page.ts';

test('DOC-PAGE dimensions, orientation and empty print margins preserve the document setup',()=>{
 assert.deepEqual(DEFAULT_PAGE,{size:'letter',orientation:'portrait',margin:1,numbers:false});
 for(const [size,w,h] of [['letter',8.5,11],['a4',8.27,11.69],['legal',8.5,14]] as const){
  for(const orientation of ['portrait','landscape'] as const){
   const page={...DEFAULT_PAGE,size,orientation,margin:.5};
   assert.deepEqual(pageInches(page),orientation==='portrait'?[w,h]:[h,w]);
   const [width,height]=pageInches(page);assert.ok(pageCss(page).startsWith(`@page { size: ${width}in ${height}in; margin: 0.5in;`));
   assert.equal((pageCss(page).match(/content: ""/g)??[]).length,10);
  }
 }
});

test('DOC-PAGE clean and numbered footer policy is literal and stable',()=>{
 const boxes=['top-left-corner','top-left','top-center','top-right','top-right-corner','bottom-left-corner','bottom-left','bottom-right','bottom-right-corner'].map(box=>`@${box} { content: ""; }`).join(' ');
 assert.equal(pageCss(DEFAULT_PAGE),`@page { size: 8.5in 11in; margin: 1in; @bottom-center { content: ""; } ${boxes} }`);
 assert.equal(pageCss({...DEFAULT_PAGE,numbers:true}),`@page { size: 8.5in 11in; margin: 1in; @bottom-center { content: counter(page); font: 10pt "Times New Roman", serif; } ${boxes} }`);
});
