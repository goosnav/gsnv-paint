import { createChrome } from './chrome.ts';
import { mountOfflineStatus } from './offline-status.ts';
import type { OfflineState } from './offline-client.ts';
import './chrome.css';
import './offline-status.css';
const chrome = createChrome({ root: document.querySelector<HTMLElement>('#app')!, model: { title: 'Offline status demonstration', workspace: 'document', dirty: false, menus: [], tools: [], panels: [], capabilities: [], status: 'Status controls stay out of the editing flow.' }, onCommand() {}, onWorkspace() {} });
const slot = document.createElement('div'); document.querySelector('.gc-statusbar')!.append(slot);
const status = mountOfflineStatus({ root: slot, onRetry: () => show('installing'), onCheck: () => show('waiting') });
const editor = document.createElement('textarea'); editor.setAttribute('aria-label', 'Fixture text'); editor.style.cssText = 'display:block;width:70%;height:180px;margin:16px'; chrome.viewport.append(editor);
const initial: OfflineState = { phase: 'ready', pageBuild: 'a'.repeat(64), readyBuild: 'a'.repeat(64), completedBytes: 41_000_000, totalBytes: 41_000_000, update: 'none' };
function show(kind: string) {
  status.update(kind === 'waiting' ? { ...initial, update: 'ready' } : kind === 'error' ? { ...initial, update: 'error', error: { code: 'offline.network', message: 'One file could not be downloaded. Reconnect and retry offline setup.' } } : { ...initial, phase: 'installing', completedBytes: 12_000_000 });
}
for (const [kind, label] of [['waiting', 'Show update ready'], ['error', 'Show install error'], ['installing', 'Show installing']]) {
  const button = document.createElement('button'); button.textContent = label!; button.addEventListener('click', () => show(kind!)); chrome.viewport.append(button);
}
status.update(initial);
