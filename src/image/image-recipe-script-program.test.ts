import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { recipeScriptProgram, recipeScriptResult, SCRIPT_LIMITS } from './image-recipe-script-program.ts';

const meta = { width: 16, height: 12, layerCount: 2 }, runId = 'run-1';
async function run(source: string) {
  const stdout: string[] = [];
  const context = vm.createContext({ console: { log: (text: string) => stdout.push(String(text) + '\n') }, TextEncoder, setTimeout });
  await vm.runInContext('(async () => { ' + recipeScriptProgram(source, meta, runId) + ' })()', context, { timeout: 1000 });
  return recipeScriptResult(stdout.join(''), meta, runId);
}
test('PU-11 scripts are only operations factories with frozen input metadata', async () => {
  const recipe = await run('if (!Object.isFrozen(image)) throw Error("metadata must be frozen"); add(ops.adjust({kind:"invert"})); add(ops.selectionAll()); add(ops.layerNew("Ink"));');
  assert.equal(recipe.name, 'JavaScript action');
  assert.equal(recipe.output, 'png');
  assert.deepEqual(recipe.steps.map(s => s.operation), [{ kind: 'adjust', adjustment: { kind: 'invert' } }, { kind: 'selection', action: 'all' }, { kind: 'layer', action: 'new', name: 'Ink' }]);
  assert.deepEqual(recipe.assets, []);
});
test('PU-11 returned operation arrays update reference sizes after absolute transforms', async () => {
  const recipe = await run('return [ops.resize(8,6), ops.downpixel(4,3,true), {kind:"transform",transform:{kind:"rotate",turns:1}}, ops.adjust({kind:"invert"})];');
  assert.deepEqual(recipe.steps.map(s => s.reference), [{ width: 16, height: 12 }, { width: 8, height: 6 }, { width: 4, height: 3 }, { width: 3, height: 4 }]);
  const crop = await run('return [{kind:"transform",transform:{kind:"crop",rect:{x:14,y:10,width:5,height:5}}},ops.selectionAll()];');
  assert.deepEqual(crop.steps[1]!.reference, { width: 2, height: 2 });
});
test('PU-11 mixing add and return, arbitrary data and external assets are rejected', async () => {
  for (const source of ['add(ops.selectionAll()); return [ops.selectionAll()];', 'return {path:"/tmp/file"};', 'return [{kind:"fetch",url:"https://example.com"}];', 'return [{kind:"paste",source:{kind:"asset",id:"photo"},name:"External",box:{x:0,y:0,width:2,height:2},sampling:"nearest",select:false}];', 'for(let i=0;i<1001;i++) add(ops.selectionAll());']) await assert.rejects(run(source));
});
test('PU-11 source/result bounds count UTF-8 bytes and envelope/run correlation is exact', () => {
  assert.throws(() => recipeScriptProgram('x'.repeat(SCRIPT_LIMITS.sourceBytes + 1), meta, runId), /64 KiB/);
  assert.throws(() => recipeScriptProgram('é'.repeat(SCRIPT_LIMITS.sourceBytes / 2 + 1), meta, runId), /64 KiB/);
  for (const bad of [{ ...meta, layerCount: 0 }, { ...meta, width: Infinity }, { ...meta, height: 0 }]) assert.throws(() => recipeScriptProgram('', bad, runId));
  const envelope = { format: 'gsnv-script-result', version: 1, runId, operations: [] };
  for (const bad of [{ ...envelope, runId: 'other' }, { ...envelope, extra: true }, { ...envelope, version: 2 }, { ...envelope, operations: Array.from({ length: 1001 }, () => ({ kind: 'selection', action: 'all' })) }]) assert.throws(() => recipeScriptResult(JSON.stringify(bad), meta, runId));
  assert.throws(() => recipeScriptResult(JSON.stringify(envelope) + JSON.stringify(envelope), meta, runId));
  assert.throws(() => recipeScriptResult('é'.repeat(SCRIPT_LIMITS.resultBytes / 2 + 1), meta, runId), /128 KiB/);
});
test('PU-11 unrelated logs, errors and mutated metadata never create partial recipes', async () => {
  await assert.rejects(run('console.log("debug text"); add(ops.selectionAll());'), /result|JSON/i);
  await assert.rejects(run('add(ops.selectionAll()); throw Error("example failure");'), /example failure/);
  await assert.rejects(run('image.width=50;'), /read only|readonly/i);
});

 test('PU-11 returned async operations finish before the module completes', async () => {
  const recipe = await run('await new Promise(resolve => setTimeout(resolve,5)); return [ops.selectionAll()];');
  assert.equal(recipe.steps.length, 1);
 });
