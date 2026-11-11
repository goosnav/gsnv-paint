import { recoveryStore } from './recovery-store.ts';

const ports = { indexedDB, localStorage };
const output = document.querySelector<HTMLPreElement>('#result')!;
const show = async () => { output.textContent = JSON.stringify(await recoveryStore({ op: 'read', workspace: 'cad' }, ports)); };
document.querySelector<HTMLButtonElement>('#store')!.onclick = async () => {
  const generation = Number(document.querySelector<HTMLInputElement>('#generation')!.value);
  const result = await recoveryStore({ op: 'write', record: {
    workspace: 'cad', generation, title: 'Recovery demonstration', payload: [new Uint8Array([0, 127, 255])],
  } }, ports);
  output.textContent = JSON.stringify(result);
};
document.querySelector<HTMLButtonElement>('#remove')!.onclick = async () => {
  await recoveryStore({ op: 'remove', workspace: 'cad' }, ports);
  await show();
};
await show();
