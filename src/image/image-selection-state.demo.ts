import { imageSelectionState } from './image-selection-state.ts';

const snapshot = imageSelectionState({ width: 4, height: 2, mask: new Uint8Array([0, 0, 0, 0, 0, 128, 255, 0]) });
console.log('Selection snapshot:', { coverage: [...snapshot!.mask], bounds: snapshot!.bounds });
