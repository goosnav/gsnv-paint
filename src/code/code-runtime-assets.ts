/**
 * PURPOSE    Load the pinned local Python runtime bytes.
 * KIND       SHELL
 * CONTRACT   IN: explicit invocation. OUT: cached asset bytes from fixed same-origin build URLs.
 *            RAISES: Error for failed loading, cross-origin URLs or a runtime exceeding 25 MiB.
 * GUARANTEES No CDN, user-selected URL, package installation or vendor execution in the editor.
 * TUNING     MAX_BYTES=25 MiB, LOAD_TIMEOUT=20 seconds.
 * DECISIONS  D1: Transfer bytes to the opaque frame. Alternative: CORS fetches from that frame;
 *            rejected to keep runtime networking disabled. Revisit if browser loading APIs change.
 * LIMITS     First offline run requires the distribution/service worker to have cached these assets.
 * TESTBENCH  src/code/code-runtime.browser.spec.ts -- see dev/CODE-RUNTIME.md
 */
import loader from 'pyodide/pyodide.mjs?raw';
import engine from 'pyodide/pyodide.asm.mjs?raw';
import wasm from 'pyodide/pyodide.asm.wasm?url';
import stdlib from 'pyodide/python_stdlib.zip?url';
import lock from 'pyodide/pyodide-lock.json?url';
const MAX_BYTES = 25 * 1024 * 1024, LOAD_TIMEOUT = 20000;
let cached: Promise<Record<string, ArrayBuffer>> | undefined;
export function loadPythonAssets(): Promise<Record<string, ArrayBuffer>> {
  if (!cached) cached = (async () => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), LOAD_TIMEOUT);
    try {
      const entries = await Promise.all(Object.entries({ wasm, stdlib, lock }).map(async ([key, url]) => {
        if (new URL(url, location.href).origin !== location.origin) throw new Error('Python assets must be bundled with this application.');
        const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
        if (!response.ok) throw new Error(`Python runtime asset could not be loaded (${response.status}).`);
        return [key, await response.arrayBuffer()] as const;
      }));
      const encoder = new TextEncoder(), result = { ...Object.fromEntries(entries), loader: encoder.encode(loader).buffer, engine: encoder.encode(engine).buffer };
      if (Object.values(result).reduce((sum, bytes) => sum + bytes.byteLength, 0) > MAX_BYTES) throw new Error('Python runtime exceeds the 25 MiB distribution limit.');
      return result;
    } finally { clearTimeout(timer); }
  })().catch(cause => { cached = undefined; throw cause; });
  return cached;
}
