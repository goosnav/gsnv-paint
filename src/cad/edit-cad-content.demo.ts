import { editableCADContent } from './editable-cad-content.ts';
import { editCADContent } from './edit-cad-content.ts';
console.log(JSON.stringify(editCADContent({ content: editableCADContent({ operation: 'new' }), action: { kind: 'rectangle', prefix: 'plate', width: '100', height: '60' } }), null, 2));
