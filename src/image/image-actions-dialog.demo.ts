import { showDialog } from '../shared/dialog.ts';
import { imageActionsDialog } from './image-actions-dialog.ts';
import { imageContent } from './image-content.ts';
import { imageRecipe } from './image-recipe.ts';
import '../shared/dialog.css';
const source = imageContent({ operation: 'new', width: 64, height: 32, fill: [255, 0, 0, 255] });
document.querySelector('button')!.addEventListener('click', () => showDialog({ root: document.body, spec: imageActionsDialog({ document, source,
  recipe: { format: 'gsnv-actions', version: 1, name: 'Invert colours', output: 'png', assets: [], steps: [{ id: 'one', label: 'Invert', enabled: true, reference: { width: 64, height: 32 }, operation: { kind: 'adjust', adjustment: { kind: 'invert' } } }] },
  onChange: value => console.log('Recipe edited', value.name), onPreview: async value => imageRecipe({ operation: 'replay', value, state: { image: source, clipboard: null } }).image,
  onApply: value => console.log('Apply requested', value), onStop() {}, onClose() {},
}) }));
