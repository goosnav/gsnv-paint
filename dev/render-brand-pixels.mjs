// Preserve the supplied white mark; rasterize its visible bounds into an integer pixel grid.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/shared/goosnav-mark-white.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ channel:'chrome' });
try {
 const page = await browser.newPage();
 const png = await page.evaluate(async svg => {
  const image = new Image(); image.src = `data:image/svg+xml;base64,${btoa(svg)}`; await image.decode();
  const original = document.createElement('canvas'); original.width = image.naturalWidth; original.height = image.naturalHeight;
  const ctx=original.getContext('2d');ctx.drawImage(image,0,0);const d=ctx.getImageData(0,0,original.width,original.height).data;
  let left=original.width,top=original.height,right=0,bottom=0;
  for(let y=0;y<original.height;y++)for(let x=0;x<original.width;x++)if(d[(y*original.width+x)*4+3]>0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  const c=document.createElement('canvas');c.width=c.height=24;const out=c.getContext('2d');
  const scale=Math.min(20/(right-left+1),22/(bottom-top+1)),w=Math.round((right-left+1)*scale),h=Math.round((bottom-top+1)*scale);
  out.drawImage(original,left,top,right-left+1,bottom-top+1,Math.floor((24-w)/2),Math.floor((24-h)/2),w,h);
  const pixels=out.getImageData(0,0,24,24);for(let i=0;i<pixels.data.length;i+=4){pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;pixels.data[i+3]=pixels.data[i+3]>=96?255:0;}
  out.putImageData(pixels,0,0);return c.toDataURL('image/png').split(',')[1];
 },source);
 await writeFile(new URL('../src/shared/goosnav-mark-pixels.png',import.meta.url),Buffer.from(png,'base64'));
} finally { await browser.close(); }
