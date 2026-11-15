import { JSDOM } from 'jsdom';
import { imageBatchDialog } from './image-batch-dialog.ts';
import { imageContent } from './image-content.ts';
const dom = new JSDOM('<main></main>'), document = dom.window.document;
const image = imageContent({ operation: 'new', width: 4, height: 4, fill: [20, 80, 130, 255] });
let runs = 0;
const spec = imageBatchDialog({ document, ports: { document }, recipe: { format: 'gsnv-actions', version: 1, name: 'Postcard colours', steps: [], assets: [], output: 'png' }, decode: async () => image, replay: async value => { runs++; return value; }, encode: async () => new Blob(), stop() {}, onDownload: async () => {}, onClose() {} });
console.log({ title: spec.title, confirm: spec.confirmLabel, actions: [...spec.previewElement.querySelectorAll('button')].map(button => ({ label: button.textContent, disabled: button.disabled })), output: spec.previewElement.querySelector('select')!.value, runs });
spec.cancel(); dom.window.close();
