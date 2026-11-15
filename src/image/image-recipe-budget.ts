/**
 * PURPOSE    Reject oversized recipe intermediates before allocating image pixels.
 * KIND       CORE
 * CONTRACT   checkRecipeBudget(image, recipe) throws a labelled RangeError when any
 *            enabled step would exceed 256 MiB of decoded document-layer pixels.
 * GUARANTEES No raster reads, writes, allocation or execution; disabled steps ignored.
 * TUNING     MAX_LAYER_BYTES=256 MiB, shared with the replay transport limit.
 * DECISIONS  D1: Preflight the entire dimension/layer path before execution.
 *            Alternative: final-output-only limit permits dangerous intermediates.
 *            Revisit if: operations use streamed or sparse layer storage.
 * LIMITS     This bounds document pixels, not a browser heap or scratch allocations.
 * TESTBENCH  node --import tsx --test src/image/image-recipe-budget.test.ts
 * DEMO       node --import tsx src/image/image-recipe-budget.demo.ts
 */
import type {ImageRecipe} from './image-operation-types.ts';
import {scaleImageOperation} from './image-operations-scale.ts';
import {clip} from './raster-ops.ts';
const MAX_LAYER_BYTES=256*1024*1024;
export function checkRecipeBudget(image:{width:number;height:number;layers:readonly unknown[]},recipe:ImageRecipe):void{
 let width=image.width,height=image.height,layers=image.layers.length;
 const check=()=>{if(width*height*layers*4>MAX_LAYER_BYTES)throw new RangeError('Recipe processing supports up to 256 MiB of decoded layer pixels, including intermediate steps.');};check();
 for(const[index,step]of recipe.steps.entries()){
  if(!step.enabled)continue;
  try{
   const op=scaleImageOperation(step.operation,step.reference,{width,height});
   if(op.kind==='paste'||op.kind==='layer'&&(op.action==='new'||op.action==='duplicate'))layers++;
   else if(op.kind==='layer'&&(op.action==='delete'||op.action==='mergeDown'))layers=Math.max(1,layers-1);
   else if(op.kind==='layer'&&op.action==='flatten')layers=1;
   if(op.kind==='downpixel'&&op.resize){width=op.width;height=op.height;}
   if(op.kind==='transform'){
    const t=op.transform;
    if(t.kind==='resize'||t.kind==='canvas'){width=t.width;height=t.height;}
    else if(t.kind==='rotate'&&t.turns!==2)[width,height]=[height,width];
    else if(t.kind==='crop'){const bounds=clip(t.rect,{width,height});width=bounds.width;height=bounds.height;}
   }
   check();
  }catch(cause){throw new RangeError(`Step ${index+1} (${step.label}): ${cause instanceof Error?cause.message:String(cause)}`);}
 }
}
