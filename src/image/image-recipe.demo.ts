import { imageContent } from './image-content.ts';
import { imageRecipe } from './image-recipe.ts';
import type { ImageRecipe } from './image-operation-types.ts';
const recipe: ImageRecipe = { format: 'gsnv-actions', version: 1, name: 'Small pixel postcard', output: 'png', assets: [], steps: [{ id: 's1', label: 'Reduce to four by four', enabled: true, reference: { width: 8, height: 8 }, operation: { kind: 'downpixel', width: 4, height: 4, resize: true } }] };
const encoded = imageRecipe({ operation: 'encode', value: recipe });
const decoded = imageRecipe({ operation: 'decode', bytes: encoded });
const result = imageRecipe({ operation: 'replay', value: decoded, state: { image: imageContent({ operation: 'new', width: 8, height: 8, fill: [20, 80, 130, 255] }), clipboard: null } });
console.log({ recipe: decoded.name, fileBytes: encoded.byteLength, resultSize: [result.image.width, result.image.height] });
