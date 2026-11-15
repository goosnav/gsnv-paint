import { imageContent } from './image-content.ts';
import { applyImageOperation } from './image-operations.ts';
import type { ImageOperationState } from './image-operation-types.ts';
let state: ImageOperationState = { image: imageContent({ operation: 'new', width: 8, height: 8, fill: [255, 255, 255, 255] }), clipboard: null };
state = applyImageOperation(state, { kind: 'shape', shape: 'rectangle', a: [1, 1], b: [3, 3], size: 1, stroke: null, fill: [220, 40, 30, 255] });
state = applyImageOperation(state, { kind: 'selection', action: 'shape', shape: { kind: 'rectangle', a: [1, 1], b: [3, 3] }, mode: 'replace' });
state = applyImageOperation(state, { kind: 'clipboard', action: 'copy', source: 'selection', background: [255, 255, 255, 255] });
state = applyImageOperation(state, { kind: 'paste', source: { kind: 'clipboard' }, name: 'Copied square', box: { x: 4, y: 4, width: 3, height: 3 }, sampling: 'nearest', select: true });
console.log({ size: [state.image.width, state.image.height], layers: state.image.layers.map(l => l.name), selection: state.image.selection!.bounds, copiedPixel: Array.from(state.clipboard!.data.slice(0, 4)) });
