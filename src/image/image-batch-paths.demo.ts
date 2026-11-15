import { batchFolderName, batchOutputName } from './image-batch-paths.ts';
console.log(batchFolderName({ now: Date.parse('2026-11-15T23:04:05Z'), runId: 'demo-1234' }));
console.log(batchOutputName({ inputName: 'Painting.jpg', extension: 'png', used: ['Painting.png'] }));
