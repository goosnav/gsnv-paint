/**
 * PURPOSE    Route an atomic CAD source edit.
 * KIND       CORE
 * ASSEMBLY   C50/C73/C74/C75/C76; the approved map assigns policy to those leaves.
 * CONTRACT   IN: valid C50 content, a CADAction and optional target sketch ID.
 *            OUT: owned, C50-validated content with one revision increment.
 *            RAISES: CADEditError for missing targets, unknown actions or revision exhaustion;
 *            leaf validation errors propagate without publishing a partial edit.
 * GUARANTEES No geometry policy, native calls or input mutation; source expressions survive.
 * TUNING     None; leaves own validation and bounds.
 * DECISIONS  D1: Route each source family to its tested policy before publication.
 *            Alternative: one large reducer hides ownership rules. Revisit if source families change.
 * LIMITS     C50's supported source subset; IDs are supplied by callers.
 * TESTBENCH  node --import tsx --test src/cad/edit-cad-content.test.ts src/cad/cad-profiles.test.ts
 */
import { editableCADContent, laterOf, type CADContent } from './editable-cad-content.ts';
import { editLegacySketch, isLegacySketchAction, type LegacySketchAction } from './cad-legacy-sketch-edit.ts';
import { editCADModel, type ModelAction } from './cad-model-edit.ts';
import { manageSketchProfiles, isProfileAction, type ProfileAction } from './sketch-profile-edit.ts';
import { cadExpressionPolicy } from './cad-expression-policy.ts';
export type CADAction = LegacySketchAction | ModelAction | ProfileAction;
export type CADEdit = { content: CADContent; action: CADAction; sketch?: string | undefined };
export function editCADContent({content,action,sketch:target}:CADEdit):CADContent {
  const fail=(message:string):never=>{throw Object.assign(new Error(message),{name:'CADEditError'});};
  if(content.graph.revision===Number.MAX_SAFE_INTEGER)fail('The revision limit was reached. This document cannot be edited.');
  const base=content.graph.features[0];
  if(target&&target!==base.id&&!laterOf(content).some(f=>f.id===target&&f.kind==='pocket'))fail('That sketch no longer exists.');
  let value:CADContent;
  if(isProfileAction(action)) {
    value=structuredClone(content);
    const all=[value.graph.features[0].definition.sketch,...laterOf(value).flatMap(f=>f.kind==='pocket'?[f.definition.sketch]:[])];
    const sketch=all.find(s=>s.id===(target??base.id))!;
    const usedIds=[...value.graph.features,...all.flatMap(s=>[...s.entities,...s.constraints,...s.dimensions,...(s.profiles??[])])].map(v=>v.id);
    const {context}=cadExpressionPolicy({units:value.units,variables:value.variables,linearMm:value.tolerance.linearMm});
    Object.assign(sketch,manageSketchProfiles({sketch,action,usedIds,context,tolerance:value.tolerance}));
  } else if(isLegacySketchAction(action))value=editLegacySketch({content,action,sketch:target});
  else if(['plane','variable','remove-variable','extrude','remove-extrude','add-cut','cut-extent','edge-feature','remove-feature','units'].includes(action.kind))value=editCADModel({content,action});
  else return fail('That CAD edit is not supported.');
  value.graph.rollback=value.graph.features.length;
  value.graph.revision=content.graph.revision+1;
  return editableCADContent({operation:'read',value});
}
