/**
 * PURPOSE    Bridge a trusted host to an opaque execution frame.
 * KIND       SHELL
 * CONTRACT   IN: live root, validated input, callback and abort signal. OUT: settled execution promise.
 *            RAISES: failures become bounded error events; Abort stops and settles immediately.
 * GUARANTEES Message source/schema checked; fixed deny-network CSP; no same-origin sandbox token.
 * TUNING     RUN_TIMEOUT=30 seconds, LOAD_TIMEOUT=30 seconds, OUTPUT=131072 characters, CHUNK=4096.
 * DECISIONS  D1: Separate broker preserves responsive Stop. Alternative: source in a frame's
 *            main thread; rejected because busy loops can block UI. Revisit if DOM scripting is required.
 * LIMITS     Chrome proof required; browser renderer memory has no per-worker quota.
 * TESTBENCH  src/code/code-runtime.browser.spec.ts -- see dev/CODE-RUNTIME.md
 */
import brokerSource from './code-runtime-broker.js?raw';
import workerSource from './code-runtime-worker.js?raw';
import { loadPythonAssets } from './code-runtime-assets.ts';
import type { CodeDocument } from './code-document.ts';
import type { CodeRuntimeEvent } from './code-runtime.ts';
type Request = { root: HTMLElement; input: { files: CodeDocument['files']; entry: string; language: 'javascript' | 'python' }; signal: AbortSignal; emit(event: CodeRuntimeEvent): void };
const RUN_TIMEOUT = 30000, LOAD_TIMEOUT = 30000, OUTPUT = 128 * 1024, CHUNK = 4096;
export function executeCodeFrame({ root, input, signal, emit }: Request): Promise<void> {
  return new Promise(resolve => {
    const document = root.ownerDocument, window = document.defaultView!, frame = document.createElement('iframe');
    frame.hidden = true; frame.title = 'Isolated code runner'; frame.setAttribute('sandbox', 'allow-scripts');
    const nonce = crypto.randomUUID(); let complete = false, output = 0;
    frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' blob: 'wasm-unsafe-eval'; worker-src data:; connect-src 'none'; base-uri 'none'; form-action 'none';"><script nonce="${nonce}">${brokerSource}</script>`;
    const finish = () => { if (complete) return; complete = true; clearTimeout(timer); signal.removeEventListener('abort', abort); window.removeEventListener('message', receive); frame.contentWindow?.postMessage({ type: 'stop' }, '*'); frame.remove(); resolve(); };
    const abort = () => { if (!complete) emit({ type: 'status', status: 'stopped' }); finish(); };
    const timeout = () => { emit({ type: 'error', text: 'Execution time limit reached. Run stopped.' }); abort(); };
    let timer = setTimeout(timeout, LOAD_TIMEOUT);
    const receive = (event: MessageEvent) => {
      if (complete || event.source !== frame.contentWindow || event.origin !== 'null') return;
      const value: unknown = event.data; if (!value || typeof value !== 'object') return;
      const message = value as Record<string, unknown>;
      if (['stdout', 'stderr', 'error'].includes(String(message.type)) && typeof message.text === 'string' && message.text.length <= CHUNK) {
        output += message.text.length;
        if (output > OUTPUT + CHUNK) { emit({ type: 'error', text: 'Output limit reached. Run stopped.' }); abort(); return; }
        emit({ type: message.type as 'stdout' | 'stderr' | 'error', text: message.text });
      } else if (message.type === 'status' && ['running', 'done', 'stopped'].includes(String(message.status))) {
        emit({ type: 'status', status: message.status as 'running' | 'done' | 'stopped' });
        if (message.status === 'running') { clearTimeout(timer); timer = setTimeout(timeout, RUN_TIMEOUT); }
        else finish();
      }
    };
    signal.addEventListener('abort', abort, { once: true }); window.addEventListener('message', receive);
    if (signal.aborted) { abort(); return; }
    void (async () => {
      try {
        const assets = input.language === 'python' ? await loadPythonAssets() : undefined;
        if (complete) return;
        frame.onload = () => { if (!complete) frame.contentWindow!.postMessage({ type: 'init', workerSource, input: { ...input, assets } }, '*'); };
        root.append(frame);
      } catch (cause) { if (!complete) { emit({ type: 'error', text: String(cause).slice(0, CHUNK) }); emit({ type: 'status', status: 'done' }); finish(); } }
    })();
  });
}
