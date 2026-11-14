/**
 * PURPOSE    Evaluate the shared CAD source-parameter policy.
 * KIND       CORE
 * CONTRACT   IN: valid units, variable sources, positive linear tolerance and ordered
 *            dimension parameters, optionally requesting unit binding. OUT: owned
 *            context, values and boundSources (null unless requested).
 *            RAISES: CADEditError for a value outside its positive/nonzero range;
 *            C03/C04 expression, unit and variable errors propagate.
 * GUARANTEES One variable evaluation per request; no mutation, geometry or I/O.
 * TUNING     Only caller-owned linearMm determines nonzero length resolution.
 * DECISIONS  D1: Share range and unit policy across edits. Alternative: duplicate
 *            evaluators drift between fields. Revisit if: parameter kinds gain different ranges.
 * LIMITS     Structural source validation and positive tolerance are caller preconditions.
 * TESTBENCH  node --import tsx --test src/cad/cad-expression-policy.test.ts
 */
import { evaluateDimension, type DimensionRequest } from './dimension-expressions.ts';
import { evaluateVariables } from './named-variables.ts';
type Variable=Parameters<typeof evaluateVariables>[0]['variables'][number];
export function cadExpressionPolicy(request:{units:'mm'|'inch';variables:readonly Variable[];linearMm:number;parameters?:readonly {expression:DimensionRequest['expression'];range?:'positive'|'nonzero'}[];bindUnits?:boolean}):{context:DimensionRequest['context'];values:number[];boundSources:string[]|null} {
  const {context}=evaluateVariables({variables:request.variables,units:request.units});
  const values:number[]=[],boundSources:string[]|null=request.bindUnits?[]:null;
  for(const {expression,range} of request.parameters??[]){
    const result=evaluateDimension({expression,context,...(request.bindUnits?{bindUnits:true}:{})});
    if(range&&(range==='nonzero'?Math.abs(result.value):result.value)<=request.linearMm)throw Object.assign(new Error(`The dimension ${JSON.stringify(expression.source)} must exceed the document tolerance.`),{name:'CADEditError'});
    values.push(result.value);if(boundSources)boundSources.push(result.boundSource!);
  }
  return{context,values,boundSources};
}
