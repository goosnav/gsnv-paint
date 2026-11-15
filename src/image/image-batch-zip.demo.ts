import { createBatchZip } from './image-batch-zip.ts';
const zip = createBatchZip({ now: Date.parse('2026-11-15T23:04:05Z') });
await zip.add('example.txt', new Blob(['Local batch output.'])); console.log({ type: zip.finish().type, bytes: zip.bytes });
