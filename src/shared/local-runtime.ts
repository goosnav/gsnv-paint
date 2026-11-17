/**
 * PURPOSE    Identify a verified local launch and explain its runtime in the footer.
 * KIND       SHELL
 * CONTRACT   IN: document metadata, current location and an owned footer element.
 *            OUT: verified local build/revision or null; disposable accessible status.
 *            RAISES: TypeError for invalid status ports or identity.
 * GUARANTEES Only the marked, build-matched HTTP loopback launch route is local.
 *            No service-worker, network, storage, reload or document operations.
 * DECISIONS  Local servers already own the complete production build; identifying
 *            that path avoids duplicating it in an offline browser installation.
 * LIMITS     The launcher supplies the identity; this is not an authentication boundary.
 *            Status styling reuses offline-status.css; the caller selects PROD behavior.
 * TESTBENCH  node --import tsx --test src/shared/local-runtime.test.ts
 */
export type LocalRuntime = Readonly<{ buildId: string; revision: string }>;
const BUILD = /^[a-f0-9]{64}$/, REVISION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;

export function localRuntime({ document, location }: {
  document: Pick<Document, 'querySelectorAll'>;
  location: Pick<Location, 'protocol' | 'hostname' | 'pathname'>;
}): LocalRuntime | null {
  if (location.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)) return null;
  const meta = (name: string) => {
    const found = document.querySelectorAll<HTMLMetaElement>(`meta[name="${name}"]`);
    return found.length === 1 ? found[0]!.content : '';
  };
  const buildId = meta('gsnv-build-id'), revision = meta('gsnv-local-revision');
  if (meta('gsnv-local-runtime') !== '1' || !BUILD.test(buildId) || !REVISION.test(revision)
    || location.pathname !== `/__gsnv-local__/start/${buildId}`) return null;
  return Object.freeze({ buildId, revision });
}

export function mountLocalRuntime({ root, runtime }: { root: HTMLElement; runtime: LocalRuntime }) {
  if (!root?.ownerDocument?.createElement || root.nodeType !== 1 || !runtime || !BUILD.test(runtime.buildId) || !REVISION.test(runtime.revision))
    throw new TypeError('Local status requires a footer element and a verified build identity.');
  const document = root.ownerDocument, details = document.createElement('details');
  details.className = 'gc-offline gc-local-runtime';
  const summary = document.createElement('summary'); summary.textContent = `Local · ${runtime.revision}`;
  summary.title = 'Runs on this computer with the same workspaces and engines as the web app.';
  const panel = document.createElement('div'); panel.className = 'gc-offline-panel';
  panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', 'Local application');
  const explanation = document.createElement('p'), running = document.createElement('p');
  explanation.textContent = 'This local build includes the same workspaces and engines as the web app. Your browser processes projects on this computer, using its processing and graphics capabilities where supported.';
  running.textContent = 'Keep the launcher window open while you work. Save your project files as usual.';
  panel.append(explanation, running); details.append(summary, panel); root.replaceChildren(details);
  const escape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && details.open) { event.preventDefault(); event.stopPropagation(); details.open = false; summary.focus(); }
  };
  details.addEventListener('keydown', escape);
  return { dispose() { details.removeEventListener('keydown', escape); details.remove(); } };
}
