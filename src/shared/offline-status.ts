/**
 * PURPOSE    Present offline readiness in a keyboard-accessible XP status control.
 * KIND       SHELL
 * CONTRACT   IN: owned root element and Retry/Check callbacks; update accepts OfflineState.
 *            OUT: stable details, progress and actionable text; dispose removes listeners.
 *            RAISES: TypeError for missing DOM or callback ports.
 * GUARANTEES Text-only rendering; no automatic focus/open/reload or session changes;
 *            Escape closes open details and returns focus to its summary.
 * TUNING     ANNOUNCE_MS=1000 bounds progress announcements; state/error changes speak now.
 * DECISIONS  D1: Native details instead of a modal keeps editing available during setup.
 *            Alternative: blocking install dialog; rejected because offline caching is
 *            optional while online. Revisit if a platform requires explicit install consent.
 * LIMITS     Styling is in offline-status.css; caller owns the stable footer slot.
 * TESTBENCH  src/shared/offline-status.test.ts -- run with: node --import tsx --test src/shared/offline-status.test.ts
 */
import type { OfflineState } from './offline-client.ts';
const ANNOUNCE_MS = 1000;
const text = (element: HTMLElement, value: string) => { if (element.textContent !== value) element.textContent = value; };
const bytes = (value: number) => value < 1024 ? `${value} bytes` : value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KiB` : `${(value / 1024 / 1024).toFixed(1)} MiB`;

export function mountOfflineStatus({ root, onRetry, onCheck }: { root: HTMLElement; onRetry(): void; onCheck(): void }) {
  if (!root?.ownerDocument?.createElement || root.nodeType !== 1 || typeof onRetry !== 'function' || typeof onCheck !== 'function') throw new TypeError('Offline status requires an element and action callbacks.');
  const document = root.ownerDocument;
  const details = document.createElement('details'); details.className = 'gc-offline';
  const summary = document.createElement('summary'); summary.textContent = 'Preparing offline…';
  const panel = document.createElement('div'); panel.className = 'gc-offline-panel'; panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', 'Offline setup');
  const explanation = document.createElement('p'), problem = document.createElement('p'), amounts = document.createElement('p');
  problem.className = 'gc-offline-error';
  const progress = document.createElement('progress'); progress.setAttribute('aria-label', 'Offline download progress'); progress.hidden = true;
  const actions = document.createElement('div'); actions.className = 'gc-offline-actions';
  const retry = document.createElement('button'), check = document.createElement('button'); retry.type = check.type = 'button';
  retry.textContent = 'Retry offline setup'; check.textContent = 'Check for updates'; retry.hidden = true; retry.disabled = check.disabled = true;
  const live = document.createElement('span'); live.className = 'gc-offline-announcement'; live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
  actions.append(retry, check); panel.append(explanation, progress, amounts, problem, actions); details.append(summary, panel, live); root.replaceChildren(details);
  let disposed = false, announced = -Infinity, lastKey = '';
  function action(callback: () => void) {
    const failed = () => {
      if (!disposed) { const message = 'Offline action could not start. Try again.'; text(problem, message); problem.hidden = false; text(live, message); }
    };
    try { void Promise.resolve(callback()).catch(failed); } catch { failed(); }
  }
  const retryAction = () => action(onRetry), checkAction = () => action(onCheck);
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && details.open) { event.preventDefault(); event.stopPropagation(); details.open = false; summary.focus(); } };
  retry.addEventListener('click', retryAction); check.addEventListener('click', checkAction); details.addEventListener('keydown', escape);
  function update(state: OfflineState) {
    if (disposed) return;
    const label = state.phase === 'ready' ? 'Ready offline' : state.phase === 'reopen-required' ? 'Reopen to enable offline' : ['checking', 'installing'].includes(state.phase) ? 'Preparing offline…' : 'Offline unavailable';
    text(summary, label);
    const busy = ['checking', 'installing'].includes(state.phase) || ['checking', 'installing'].includes(state.update);
    const available = state.phase !== 'unavailable'; retry.disabled = check.disabled = busy || !available;
    retry.hidden = !available || (state.phase !== 'error' && state.update !== 'error');
    text(explanation, state.update === 'ready' ? 'Update ready. Save your work, close all gsnv-paint tabs, and reopen.'
      : state.phase === 'ready' && state.update === 'error' ? 'Update failed. Your current offline copy remains ready.'
      : state.phase === 'ready' ? 'This version is stored for offline use. Keep saving your project files as usual.'
      : state.phase === 'reopen-required' ? 'Save your work, close all gsnv-paint tabs, and reopen to enable offline use.'
      : busy ? 'Preparing this version for offline use. You can keep editing.' : 'Offline setup has not finished. You can keep editing while online.');
    progress.hidden = !busy || !state.totalBytes; amounts.hidden = progress.hidden;
    progress.max = Math.max(1, state.totalBytes); progress.value = state.completedBytes;
    const amount = state.totalBytes ? `${Math.floor(state.completedBytes / state.totalBytes * 100)}% prepared (${bytes(state.completedBytes)} of ${bytes(state.totalBytes)}).` : '';
    text(amounts, amount); text(problem, state.error?.message ?? ''); problem.hidden = !state.error;
    const key = `${state.phase}:${state.update}:${state.error?.code ?? ''}:${state.error?.message ?? ''}`;
    if (key !== lastKey || Date.now() - announced >= ANNOUNCE_MS) {
      text(live, `${label}. ${state.update === 'ready' ? explanation.textContent : state.error?.message ?? (busy ? amount : '')}`);
      announced = Date.now(); lastKey = key;
    }
  }
  function dispose() {
    if (disposed) return; disposed = true;
    retry.removeEventListener('click', retryAction); check.removeEventListener('click', checkAction); details.removeEventListener('keydown', escape); details.remove();
  }
  return { update, dispose };
}
