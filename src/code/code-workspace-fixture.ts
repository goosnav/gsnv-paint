// Isolated browser test entry. The production app imports only createCodeWorkspace.
import { mountApp } from '../app/app-shell.ts';
import { createCodeWorkspace } from './code-workspace.ts';
import { recentProjects } from '../shared/recent-projects.ts';
import '../shared/chrome.css';
import '../shared/dialog.css';
import '../app/app.css';
declare global { interface Window { codeFixture: ReturnType<typeof mountApp> } }
const files = { document, URL, setTimeout: (callback: () => void, milliseconds: number) => window.setTimeout(callback, milliseconds) };
window.codeFixture = mountApp({ root: document.querySelector('#app')!, adapters: { code: createCodeWorkspace(files) }, files, recovery: { indexedDB, localStorage }, recent: recentProjects(indexedDB), probe: { environment: window, codecRequests: [] } });
window.addEventListener('pagehide', () => window.codeFixture.dispose(), { once: true });
