import { editableCADContent } from './editable-cad-content.ts';
import { editCADModel } from './cad-model-edit.ts';
console.log(editCADModel({content:editableCADContent({operation:'new'}),action:{kind:'plane',plane:'XZ'}}));
