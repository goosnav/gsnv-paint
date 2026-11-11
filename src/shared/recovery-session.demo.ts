import { recoverySession, type RecoveryPort, type RecoverySessionRequest } from './recovery-session.ts';
import { recoveryStore } from './recovery-store.ts';

const ports = { indexedDB, localStorage };
const output = document.querySelector<HTMLPreElement>('#result')!;
let highestObserved: number | undefined; let completed = 0;
const port: RecoveryPort = async request => {
  const result = await recoveryStore(request, ports);
  if (result.ok && result.value) {
    highestObserved = highestObserved === undefined ? result.value.generation : Math.max(highestObserved, result.value.generation);
    document.querySelector('#observed')!.textContent = `Highest observed generation: ${highestObserved}`;
  }
  return result;
};
async function run(request: RecoverySessionRequest) {
  const buttons = document.querySelectorAll<HTMLButtonElement>('button');
  buttons.forEach(button => { button.disabled = true; });
  try {
    output.textContent = JSON.stringify(await recoverySession(request, port));
    document.querySelector('#completed')!.textContent = `Completed operations: ${++completed}`;
  } finally { buttons.forEach(button => { button.disabled = false; }); }
}
document.querySelector<HTMLButtonElement>('#save')!.onclick = () => {
  const title = document.querySelector<HTMLInputElement>('#title')!.value;
  const generation = Number(document.querySelector<HTMLInputElement>('#generation')!.value);
  void run({ operation: 'save', workspace: 'image', generation, package: {
    project: { format: 'gsnv-image', version: 1, id: 'recovery-demo', title, content: { width: 1, height: 1 } },
    assets: [{ id: 'rgba-0', mime: 'application/octet-stream', bytes: new Uint8Array([255, 0, 0, 255]) }],
  } });
};
document.querySelector<HTMLButtonElement>('#recover')!.onclick = () => { void run({ operation: 'recover', workspace: 'image', generation: 0 }); };
document.querySelector<HTMLButtonElement>('#discard')!.onclick = () => { void run({ operation: 'discard', workspace: 'image', generation: 0 }); };
await run({ operation: 'recover', workspace: 'image', generation: 0 });
