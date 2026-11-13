import { createCADWorkspace } from '../cad/cad-workspace.ts';
import { createImageWorkspace } from '../image/image-workspace.ts';
import { createPhotoWorkspace } from '../photo/photo-workspace.ts';
import { createVideoWorkspace } from '../video/video-workspace.ts';
import { mountApp } from './app-shell.ts';
import { recentProjects } from '../shared/recent-projects.ts';
import type { FilePorts } from '../shared/file-access.ts';
import type { RecoveryPorts } from '../shared/recovery-store.ts';
import '../shared/chrome.css';
import '../shared/dialog.css';
import './app.css';

const browser = window as Window & Pick<FilePorts, 'showOpenFilePicker' | 'showSaveFilePicker'>;
const recovery: RecoveryPorts = {};
// Some browser settings throw on storage access itself; the assembly reports its absence.
try { recovery.indexedDB = window.indexedDB; } catch { /* Leave the missing port visible. */ }
try { recovery.localStorage = window.localStorage; } catch { /* Manual project files remain available. */ }
const root = document.querySelector<HTMLElement>('#app')!;
try {
  const files: FilePorts = {
    document, URL, setTimeout: (callback, milliseconds) => window.setTimeout(callback, milliseconds),
    ...(browser.showOpenFilePicker ? { showOpenFilePicker: browser.showOpenFilePicker.bind(window) } : {}),
    ...(browser.showSaveFilePicker ? { showSaveFilePicker: browser.showSaveFilePicker.bind(window) } : {}),
  };
  const app = mountApp({ root, adapters: { cad: createCADWorkspace(files), image: createImageWorkspace(files), photo: createPhotoWorkspace(files), video: createVideoWorkspace(files) }, recovery, recent: recentProjects(recovery.indexedDB), probe: { environment: window, codecRequests: [] }, files });
  root.tabIndex = -1;
  void app.ready.then(() => { if (document.activeElement === document.body) root.focus(); });
  window.addEventListener('pagehide', () => app.dispose(), { once: true });
} catch (cause) {
  const notice = document.createElement('p'); notice.className = 'app-startup-error';
  notice.textContent = `gsnv-paint could not start in this browser: ${cause instanceof Error ? cause.message : String(cause)}`;
  root.replaceChildren(notice);
}
