import { editableCADContent } from './editable-cad-content.ts';
import { editCADContent } from './edit-cad-content.ts';
import { linearSketchProgram } from './linear-sketch-program.ts';
const value = editCADContent({content:editableCADContent({operation:'new'}),action:{kind:'rectangle',prefix:'r',width:'100',height:'60'}});
console.log(linearSketchProgram({sketch:value.graph.features[0].definition.sketch,context:{units:'mm',variables:{}},tolerance:1e-7}).primitives);
