import { createOfflineClient } from './offline-client.ts';
declare const __DEMO_BUILD__: string;
const output = document.querySelector<HTMLElement>('[role=status]')!;
const client = createOfflineClient({ environment: window, buildId: __DEMO_BUILD__, onState(state) {
  output.textContent = `${state.phase === 'ready' ? 'Ready offline' : state.phase} ${state.readyBuild ?? ''} · update ${state.update}${state.error ? ': ' + state.error.message : ''}`;
  output.dataset.phase = state.phase; output.dataset.update = state.update;
} });
document.querySelector('[data-check]')!.addEventListener('click', () => { void client.check(); });
document.querySelector('[data-retry]')!.addEventListener('click', () => { void client.retry(); });
window.addEventListener('pagehide', () => client.dispose(), { once: true });
