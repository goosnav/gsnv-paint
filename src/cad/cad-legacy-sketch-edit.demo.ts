import { editableCADContent } from './editable-cad-content.ts';
import { editLegacySketch } from './cad-legacy-sketch-edit.ts';
console.log(editLegacySketch({content:editableCADContent({operation:'new'}),action:{kind:'rectangle',prefix:'demo',width:'30',height:'20'}}));
