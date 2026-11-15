import { JSDOM } from 'jsdom';
import { pickBatchInputs, createBatchDestination } from './image-batch-files.ts';
const dom = new JSDOM('<body></body>'), file = new File(['demo'], 'example.png');
const ports = { document: dom.window.document, showOpenFilePicker: async () => [{ kind: 'file' as const, name: file.name, getFile: async () => file }] };
const selection = (await pickBatchInputs({ source: 'files', ports }))!;
const destination = (await createBatchDestination({ selection, mode: 'zip', now: Date.UTC(2026, 10, 15), runId: 'demo-1234', ports }))!;
await destination.write('example.png', await selection.inputs[0]!.read());
console.log(await destination.finish()); dom.window.close();
