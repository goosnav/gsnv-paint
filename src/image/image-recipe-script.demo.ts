import { recipeScriptProgram, recipeScriptResult } from './image-recipe-script-program.ts';
const image = { width: 800, height: 600, layerCount: 1 }, runId = 'demo';
const source = 'return [ops.resize(400,300), ops.downpixel(80,60,false), ops.adjust({kind:"invert"})];';
const program = recipeScriptProgram(source, image, runId);
const recipe = recipeScriptResult(JSON.stringify({ format: 'gsnv-script-result', version: 1, runId, operations: [{ kind: 'transform', transform: { kind: 'resize', width: 400, height: 300 } }, { kind: 'downpixel', width: 80, height: 60, resize: false }, { kind: 'adjust', adjustment: { kind: 'invert' } }] }), image, runId);
console.log({ source, generatedWorkerBytes: new TextEncoder().encode(program).byteLength, name: recipe.name, references: recipe.steps.map(step => step.reference) });
