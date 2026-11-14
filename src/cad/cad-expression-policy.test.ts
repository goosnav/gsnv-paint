import test from 'node:test';
import assert from 'node:assert/strict';
import { cadExpressionPolicy } from './cad-expression-policy.ts';
const expression=(source:string)=>({source,kind:'length' as const});
const request={units:'mm' as const,linearMm:1e-7,variables:[{name:'width',expression:expression('40')}],parameters:[{expression:expression('width / 2'),range:'positive' as const},{expression:expression('-2'),range:'nonzero' as const}]};
test('C74 shared expression policy validates variables and ordered ranges without mutation',()=>{
  const before=structuredClone(request),r=cadExpressionPolicy(request);assert.deepEqual(r.values,[20,-2]);assert.equal(r.boundSources,null);assert.deepEqual(request,before);
  assert.deepEqual(cadExpressionPolicy({...request,parameters:[]}).values,[]);
  for(const source of ['0','0.00000001','-2'])assert.throws(()=>cadExpressionPolicy({...request,parameters:[{expression:expression(source),range:'positive'}]}),{name:'CADEditError'});
  assert.throws(()=>cadExpressionPolicy({...request,parameters:[{expression:expression('0'),range:'nonzero'}]}),{name:'CADEditError'});
  assert.throws(()=>cadExpressionPolicy({...request,variables:[{name:'width',expression:expression('width')}]}),/cycle/i);
  assert.throws(()=>cadExpressionPolicy({...request,parameters:[{expression:expression('unknown')}]}),/unknown/i);
  assert.throws(()=>cadExpressionPolicy({...request,parameters:[{expression:expression('2 deg')}]}),/dimension|length|unit/i);
});
test('C74 unit binding preserves physical values and named expressions across document units',()=>{
  const parameters=[{expression:expression('40')},{expression:expression('width / 2 + 3')}];
  const mm=cadExpressionPolicy({...request,parameters,bindUnits:true});assert.ok(mm.boundSources);assert.match(mm.boundSources[1]!,/width/);
  const inch=cadExpressionPolicy({units:'inch',linearMm:1e-7,variables:[{name:'width',expression:expression(mm.boundSources[0]!)}],parameters:mm.boundSources.map(source=>({expression:expression(source)}))});
  assert.deepEqual(inch.values,mm.values);
});
