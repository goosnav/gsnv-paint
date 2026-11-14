/**
 * PURPOSE    Execute one source entry in an opaque-origin dedicated worker.
 * KIND       SHELL
 * CONTRACT   IN: one trusted broker message with validated files and fixed engine bytes.
 *            OUT: bounded text/status messages. RAISES: errors become text messages.
 * GUARANTEES Fresh memory-only filesystem, no app-origin authority, no automatic package loading.
 * TUNING     CHUNK=4096 characters; total output limit is enforced again by the broker.
 * DECISIONS  D1: Blob module execution. Alternative: eval; rejected because CSP can then keep
 *            string compilation disabled. Revisit if a separately verified JS bundler is added.
 * LIMITS     Python stdlib/local imports; JavaScript entry only. No DOM, native files or npm.
 * TESTBENCH  src/code/code-runtime.browser.spec.ts -- see dev/CODE-RUNTIME.md
 */
const CHUNK = 4096, OUTPUT = 128 * 1024;
const send = globalThis.postMessage.bind(globalThis);
let emitted = 0, limited = false;
function emit(type, text) {
  if (limited) return;
  text = String(text);
  for (let offset = 0; offset < text.length; offset += CHUNK) {
    const part = text.slice(offset, offset + CHUNK); emitted += part.length;
    if (emitted > OUTPUT) { limited = true; send({ type: 'limit' }); return; }
    send({ type, text: part });
  }
}
function display(value) {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value) ?? String(value); } catch { return String(value); }
}
for (const key of ['log', 'info', 'debug', 'warn', 'error']) console[key] = (...values) => emit(key === 'warn' || key === 'error' ? 'stderr' : 'stdout', values.map(display).join(' ') + '\n');
// User code never needs to spawn another execution context, including through Python's JS bridge.
for (const key of ['Worker', 'SharedWorker']) Object.defineProperty(globalThis, key, { value: undefined, writable: false, configurable: false });
onmessage = async event => {
  onmessage = null;
  const { files, entry, language, assets } = event.data;
  const urls = [];
  const moduleURL = text => { const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' })); urls.push(url); return url; };
  try {
    if (language === 'javascript') {
      send({ type: 'status', status: 'running' });
      await import(moduleURL(files.find(file => file.path === entry).text));
    } else {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      const local = new Map([['https://runtime.invalid/pyodide.asm.wasm', assets.wasm], ['https://runtime.invalid/python_stdlib.zip', assets.stdlib]]);
      // The vendor loader expects fetch responses. This map never delegates to browser fetch;
      // inherited connect-src 'none' remains the boundary even if user code replaces this shim.
      globalThis.fetch = async input => {
        const key = String(typeof input === 'object' && input.url ? input.url : input), bytes = local.get(key);
        if (!bytes) throw new Error('Network access is unavailable in this runtime.');
        return new Response(bytes, { headers: { 'Content-Type': key.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream' } });
      };
      const { loadPyodide } = await import(moduleURL(decoder.decode(assets.loader)));
      const { default: createPyodideModule } = await import(moduleURL(decoder.decode(assets.engine)));
      const py = await loadPyodide({ indexURL: 'https://runtime.invalid/', createPyodideModule, lockFileContents: decoder.decode(assets.lock), packages: [], stdin: () => null, stdout: text => emit('stdout', text + '\n'), stderr: text => emit('stderr', text + '\n') });
      const stdout = new TextDecoder(), stderr = new TextDecoder();
      py.setStdout({ write: bytes => { emit('stdout', stdout.decode(bytes, { stream: true })); return bytes.length; } });
      py.setStderr({ write: bytes => { emit('stderr', stderr.decode(bytes, { stream: true })); return bytes.length; } });
      py.FS.mkdirTree('/project'); py.FS.chdir('/project');
      for (const file of files) { const path = '/project/' + file.path; py.FS.mkdirTree(path.slice(0, path.lastIndexOf('/'))); py.FS.writeFile(path, file.text); }
      const directory = '/project/' + entry.slice(0, Math.max(0, entry.lastIndexOf('/')));
      send({ type: 'status', status: 'running' });
      await py.runPythonAsync(`import sys, runpy\nsys.path.insert(0, ${JSON.stringify(directory)})\nrunpy.run_path(${JSON.stringify('/project/' + entry)}, run_name="__main__")`);
    }
    send({ type: 'status', status: 'done' });
  } catch (cause) { emit('error', cause?.stack || cause?.message || String(cause)); send({ type: 'status', status: 'done' }); }
  finally { for (const url of urls) URL.revokeObjectURL(url); }
};
