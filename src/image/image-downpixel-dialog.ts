/**
 * PURPOSE    Specify reversible down-pixel controls.
 * KIND       SHELL
 * CONTRACT   imageDownpixelDialog(source dimensions and preview/commit/cancel ports)
 *            returns a DialogSpec with whole bounded logical dimensions.
 *            RAISES: RangeError for invalid original dimensions.
 * GUARANTEES No image allocation, mutation or I/O. Caller owns asynchronous previews.
 * TUNING     Initial block size four; linked dimensions are width-led.
 * DECISIONS  D1: Explicit block/dimensions choice prevents competing controls.
 *            Alternative: simultaneously editable controls, rejected as ambiguous.
 *            Revisit if: shared dialog gains linked input widgets.
 * LIMITS     Nearest cells at non-divisible dimensions may differ by one pixel.
 * TESTBENCH  node --import tsx --test src/image/image-downpixel-dialog.test.ts
 * DEMO       node --import tsx src/image/image-downpixel-dialog.demo.ts
 */
import type { DialogSpec } from '../shared/dialog.ts';
type Settings={width:number;height:number;resize:boolean};
export function imageDownpixelDialog(ports:SettingsPorts):DialogSpec{
 const {width,height}=ports;if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new RangeError('Invalid source dimensions.');
 return {title:'Down-pixel',description:'Sample larger, sharply defined pixels. Keep canvas size makes blocks; Resize canvas creates a smaller image. With linked dimensions, width controls height.',
 fields:[{key:'method',label:'Set resolution by',type:'select',choices:[{value:'block',label:'Pixel block size'},{value:'dimensions',label:'Logical dimensions'}]},
 {key:'block',label:'Pixel block size',type:'number',min:1,max:Math.max(width,height),step:1},
 {key:'width',label:'Logical width (px)',type:'number',min:1,max:width,step:1},{key:'height',label:'Logical height (px)',type:'number',min:1,max:height,step:1},
 {key:'keep',label:'Keep aspect ratio (width controls height)',type:'checkbox'},{key:'resize',label:'Resize canvas to logical dimensions',type:'checkbox'}],
 initial:{method:'block',block:Math.min(4,Math.max(width,height)),width:Math.max(1,Math.round(width/4)),height:Math.max(1,Math.round(height/4)),keep:true,resize:false},
 validate(v){let w=Number(v.width),h=Number(v.height);const block=Number(v.block);if(v.method==='block'){if(!Number.isInteger(block)||block<1||block>Math.max(width,height))return{ok:false,error:{code:'image.downpixel',message:'Use a whole pixel block size within the image.'}};w=Math.max(1,Math.round(width/block));h=Math.max(1,Math.round(height/block));}else if(v.method==='dimensions'){if(v.keep)h=Math.max(1,Math.round(w*height/width));}else return{ok:false,error:{code:'image.downpixel',message:'Choose how to set the resolution.'}};
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>width||h>height)return{ok:false,error:{code:'image.downpixel',message:'Logical dimensions must be whole pixels within the current image.'}};
 return{ok:true,value:{width:w,height:h,resize:!!v.resize}};},preview:v=>ports.preview(v as Settings),commit:v=>ports.commit(v as Settings),cancel:ports.cancel};
}
type SettingsPorts={width:number;height:number;preview(value:Settings):void;commit(value:Settings):void;cancel():void};
