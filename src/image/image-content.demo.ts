import { imageContent } from './image-content.ts';

const initial = imageContent({ operation: 'new', width: 3, height: 2, fill: [20, 40, 60, 0] });
const selected = imageContent({ operation: 'selection', previous: initial, mask: new Uint8Array([0, 128, 255, 0, 0, 0]) });
const encoded = imageContent({ operation: 'encode', value: selected });
const reopened = imageContent({ operation: 'decode', ...encoded });
console.log('Native layout:', encoded.content);
console.log('Reopened coverage:', [...reopened.selection!.mask], 'bounds:', reopened.selection!.bounds);
