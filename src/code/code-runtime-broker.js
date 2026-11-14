/**
 * PURPOSE    Broker bounded execution of an opaque worker.
 * KIND       SHELL
 * CONTRACT   IN: one parent init or stop message. OUT: validated bounded events on that parent.
 *            RAISES: worker failures become error events and completion.
 * GUARANTEES The worker never receives a parent/window handle; no arbitrary parent commands.
 * TUNING     OUTPUT=131072 characters, CHUNK=4096, MESSAGES=1024 per run.
 * DECISIONS  D1: Trusted iframe broker owns Worker. Alternative: editor-origin worker;
 *            rejected because it can read saved projects. Revisit if opaque worker constructors arrive.
 * LIMITS     Browser memory allocation is external; the host also imposes a run deadline.
 * TESTBENCH  src/code/code-runtime.browser.spec.ts -- see dev/CODE-RUNTIME.md
 */
let worker, started = false, running = false, output = 0, messages = 0;
const OUTPUT = 128 * 1024, CHUNK = 4096, MESSAGES = 1024;
function stop() { worker?.terminate(); worker = undefined; }
function emit(value) { parent.postMessage(value, '*'); }
onmessage = event => {
  if (event.source !== parent) return;
  if (event.data?.type === 'stop') { stop(); return; }
  if (started || event.data?.type !== 'init') return;
  started = true;
  try {
    // Chrome rejects blob module workers from opaque frames. A data bootstrap
    // remains opaque, inherits the deny-network CSP, and supports module imports.
    worker = new Worker('data:text/javascript,' + encodeURIComponent(event.data.workerSource), { type: 'module', credentials: 'omit' });
    worker.onerror = event => { emit({ type: 'error', text: String(event.message || 'Isolated worker could not start.').slice(0, CHUNK) }); stop(); emit({ type: 'status', status: 'done' }); };
    worker.onmessage = event => {
      if (!worker) return;
      if (++messages > MESSAGES) { stop(); emit({ type: 'error', text: 'Message limit reached. Run stopped.' }); emit({ type: 'status', status: 'stopped' }); return; }
      const value = event.data;
      if (!value || typeof value !== 'object') return;
      if (value.type === 'limit' || typeof value.text === 'string' && (value.text.length > CHUNK || (output += value.text.length) > OUTPUT)) {
        stop(); emit({ type: 'error', text: 'Output limit reached (131072 characters). Run stopped.' }); emit({ type: 'status', status: 'stopped' }); return;
      }
      if (['stdout', 'stderr', 'error'].includes(value.type) && typeof value.text === 'string') emit({ type: value.type, text: value.text });
      if (value.type === 'status' && ['running', 'done'].includes(value.status)) {
        if (value.status === 'running' && running) return;
        running = true; if (value.status === 'done') stop(); emit({ type: 'status', status: value.status });
      }
    };
    worker.postMessage(event.data.input);
  } catch (cause) { emit({ type: 'error', text: String(cause).slice(0, CHUNK) }); emit({ type: 'status', status: 'done' }); stop(); }
};
