import { imageNewDialog, imagePolicyDialog } from './image-settings.ts';
import { showDialog } from '../shared/dialog.ts';
import { pixelPolicy } from './image-pixel-policy.ts';
import '../shared/dialog.css';
const root = document.querySelector<HTMLElement>('#app');
if (root) {
  const output = document.createElement('pre'), create = document.createElement('button'), settings = document.createElement('button');
  create.textContent = 'New image'; settings.textContent = 'Pixel settings'; root.append(create, settings, output);
  create.onclick = () => showDialog({ root, spec: imageNewDialog({ document, colour: [255, 0, 0, 255], onCreate: value => { output.textContent = JSON.stringify(value, null, 2); } }) });
  settings.onclick = () => showDialog({ root, spec: imagePolicyDialog({ document, policy: pixelPolicy(), raster: { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]) }, onPreview: value => { output.textContent = JSON.stringify(value, null, 2); }, onCommit() {}, onCancel() { output.textContent = 'Cancelled'; } }) });
}
