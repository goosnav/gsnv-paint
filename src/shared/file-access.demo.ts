import { fileAccess, type FilePorts } from './file-access.ts';

const ports: FilePorts = { document, URL, setTimeout: (callback, delay) => window.setTimeout(callback, delay) };
const output = document.querySelector<HTMLOutputElement>('#result')!;
let bytes: readonly Uint8Array[] = [new Uint8Array([0, 127, 128, 255])];
let name = 'sample.bin';
document.querySelector<HTMLButtonElement>('#open')!.onclick = async () => {
  const result = await fileAccess({ op: 'open', accept: { 'application/octet-stream': ['.bin'] } }, ports);
  if ('ok' in result && result.ok) {
    bytes = result.value.bytes;
    name = result.value.name;
    output.textContent = `Opened ${name} (${bytes.reduce((sum, part) => sum + part.length, 0)} bytes)`;
  } else output.textContent = 'cancelled' in result ? 'Cancelled' : result.error.message;
};
document.querySelector<HTMLButtonElement>('#save')!.onclick = async () => {
  const result = await fileAccess({ op: 'save', name, mime: 'application/octet-stream', bytes }, ports);
  output.textContent = 'cancelled' in result ? 'Cancelled' : result.ok ? 'Download handed to browser' : result.error.message;
};
