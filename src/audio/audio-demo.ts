import { mountApp } from '../app/app-shell.ts';
import { recentProjects } from '../shared/recent-projects.ts';
import { createAudioWorkspace } from './audio-workspace.ts';
import type { FilePorts } from '../shared/file-access.ts';
import '../shared/chrome.css';
import '../shared/dialog.css';
import '../app/app.css';

const files: FilePorts = { document, URL, setTimeout: (callback, milliseconds) => window.setTimeout(callback, milliseconds) };
const recovery = { indexedDB, localStorage };
const app = mountApp({ root: document.querySelector<HTMLElement>('#app')!, adapters: { audio: createAudioWorkspace(files) }, files, recovery, recent: recentProjects(indexedDB), probe: { environment: window, codecRequests: [] } });
window.addEventListener('pagehide', () => app.dispose(), { once: true });
