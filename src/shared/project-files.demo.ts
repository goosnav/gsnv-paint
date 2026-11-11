import { projectFiles, type ProjectFileRequest } from './project-files.ts';
import type { FilePorts } from './file-access.ts';

// A transport fixture, not an image editor. Domain factories belong to later phases.
type Package = Extract<ProjectFileRequest, { operation: 'save' }>['package'];
let current: Package = {
  project: { format: 'gsnv-image', version: 1, id: 'pixel-example', title: 'Pixel sample', content: { width: 1, height: 1, tile: 'rgba-0' } },
  assets: [{ id: 'rgba-0', mime: 'application/octet-stream', bytes: new Uint8Array([255, 0, 0, 255]) }],
};
const ports: FilePorts = { document, URL, setTimeout: (callback, delay) => window.setTimeout(callback, delay) };
const status = document.querySelector<HTMLOutputElement>('#result')!;
const summary = document.querySelector<HTMLPreElement>('#package')!;
const render = () => { summary.textContent = JSON.stringify({ project: current.project, assets: current.assets.map(asset => ({ id: asset.id, mime: asset.mime, bytes: [...asset.bytes] })) }, null, 2); };
document.querySelector<HTMLButtonElement>('#open')!.onclick = async () => {
  const result = await projectFiles({ operation: 'open' }, ports);
  if ('cancelled' in result) status.textContent = 'Open cancelled';
  else if (!result.ok) status.textContent = `${result.error.code}: ${result.error.message}`;
  else { current = result.value; render(); status.textContent = `Opened ${current.project.title}`; }
};
document.querySelector<HTMLButtonElement>('#save')!.onclick = async () => {
  const result = await projectFiles({ operation: 'save', package: current }, ports);
  status.textContent = 'cancelled' in result ? 'Save cancelled' : result.ok ? `Download handed to browser: ${result.value.name}` : `${result.error.code}: ${result.error.message}`;
};
document.querySelector<HTMLButtonElement>('#alternate')!.onclick = () => {
  current = { project: { ...current.project, id: 'alternate', title: 'Alternate pixel' }, assets: [{ id: 'rgba-0', mime: 'application/octet-stream', bytes: new Uint8Array([0, 0, 255, 255]) }] };
  render(); status.textContent = 'Alternate fixture selected';
};
render();
