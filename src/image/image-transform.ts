/**
 * PURPOSE    Calculate the geometry of an interactive raster selection transform.
 * KIND       CORE
 * CONTRACT   IN: validate(box), or drag with original box, handle, pointer start/end
 *            in image coordinates, optional keep/shift. OUT: owned validated box.
 *            RAISES: RangeError for invalid coordinates, dimensions or pixel budget;
 *            TypeError for an unknown operation/handle.
 * GUARANTEES Pure; opposite resize anchor stays fixed, rotation keeps center;
 *            Shift constrains aspect or snaps angles. Never edits source pixels.
 * TUNING     One-pixel minimum dimensions; rotation snap=15 degrees; MAX_PIXELS
 *            matches the raster allocator, including rotated bounds.
 * DECISIONS  D1: Keep oriented bounds through previews, sample once on apply.
 *            Alternative: repeated raster resize; rejected for cumulative blur.
 *            Revisit if perspective/warp is explicitly added to scope.
 * LIMITS     No skew, reflection or perspective; crossing an anchor clamps at 1px.
 * TESTBENCH  src/image/image-transform.test.ts — node --import tsx --test src/image/image-transform.test.ts
 */
import { MAX_PIXELS } from './raster-ops.ts';
export type TransformBox = {x:number;y:number;width:number;height:number;angle:number};
type Point = {x:number;y:number};
type Request = {op:'validate';box:TransformBox}|{op:'drag';box:TransformBox;handle:string;start:Point;end:Point;shift?:boolean;keep?:boolean};
const directions:Record<string,[number,number]>={nw:[-1,-1],n:[0,-1],ne:[1,-1],e:[1,0],se:[1,1],s:[0,1],sw:[-1,1],w:[-1,0]};
function validate(b:TransformBox):TransformBox {
  if(!b||![b.x,b.y,b.width,b.height,b.angle].every(Number.isFinite))throw new RangeError('Transform coordinates must be finite.');
  if(b.width<1||b.height<1)throw new RangeError('Transform dimensions must be positive pixels.');
  const angle=((b.angle+180)%360+360)%360-180,t=angle*Math.PI/180,c=Math.abs(Math.cos(t)),s=Math.abs(Math.sin(t));
  if(Math.max(1,Math.round(b.width*c+b.height*s))*Math.max(1,Math.round(b.width*s+b.height*c))>MAX_PIXELS)throw new RangeError(`Transform exceeds the ${MAX_PIXELS.toLocaleString()} pixel limit.`);
  return {...b,angle};
}
export function imageTransform(request:Request):TransformBox {
  const b=validate(request.box);if(request.op==='validate')return b;
  if(request.op!=='drag')throw new TypeError('Unknown transform operation.');
  const {start,end,handle}=request;if(![start.x,start.y,end.x,end.y].every(Number.isFinite))throw new RangeError('Pointer coordinates must be finite.');
  const dx=end.x-start.x,dy=end.y-start.y,cx=b.x+b.width/2,cy=b.y+b.height/2;
  if(handle==='move')return validate({...b,x:b.x+dx,y:b.y+dy});
  if(handle==='rotate') {let angle=b.angle+(Math.atan2(end.y-cy,end.x-cx)-Math.atan2(start.y-cy,start.x-cx))*180/Math.PI;if(request.shift)angle=Math.round(angle/15)*15;return validate({...b,angle});}
  const direction=directions[handle];if(!direction)throw new TypeError('Unknown transform handle.');
  const [hx,hy]=direction,t=b.angle*Math.PI/180,c=Math.cos(t),s=Math.sin(t),u=dx*c+dy*s,v=-dx*s+dy*c;
  let width=Math.max(1,b.width+hx*u),height=Math.max(1,b.height+hy*v);
  if(request.keep||request.shift){const factor=hx===0?height/b.height:hy===0?width/b.width:Math.abs(width/b.width-1)>=Math.abs(height/b.height-1)?width/b.width:height/b.height;const safe=Math.max(1/b.width,1/b.height,factor);width=b.width*safe;height=b.height*safe;}
  const mx=hx*(width-b.width)/2,my=hy*(height-b.height)/2;
  return validate({x:cx+mx*c-my*s-width/2,y:cy+mx*s+my*c-height/2,width,height,angle:b.angle});
}
