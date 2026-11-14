// Isolated production-browser assembly; never imported by the application.
import { mountApp } from '../app/app-shell.ts';
import { createImageWorkspace } from '../image/image-workspace.ts';
import { createVideoWorkspace } from '../video/video-workspace.ts';
import { createCADWorkspace } from '../cad/cad-workspace.ts';
import { recentProjects } from '../shared/recent-projects.ts';
import '../shared/chrome.css';
import '../shared/dialog.css';
import '../app/app.css';
declare global { interface Window { bridgeWorkspace: ReturnType<typeof mountApp> } }
const files = { document, URL, setTimeout: (callback: () => void, milliseconds: number) => window.setTimeout(callback, milliseconds) };
window.bridgeWorkspace = mountApp({ root: document.querySelector('#app')!, adapters: { image: createImageWorkspace(files), video: createVideoWorkspace(files), cad: createCADWorkspace(files) }, files, recovery: { indexedDB, localStorage }, recent: recentProjects(indexedDB), probe: { environment: window, codecRequests: [] } });
window.addEventListener('pagehide', () => window.bridgeWorkspace.dispose(), { once: true });
