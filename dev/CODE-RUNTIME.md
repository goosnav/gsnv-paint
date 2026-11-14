# Code document and isolated runtime

K01 is a pure source-document module. K02 runs source only after an explicit `run` call. These bricks are verified independently of the application mount. K03/K04 editing and integration evidence is recorded in [CODE-WORKFLOW.md](CODE-WORKFLOW.md); owner acceptance and offline distribution remain separate gates.

## Host contract

`codeDocument(request)` returns a deeply frozen `CodeDocument` with `{ files, entry }`. A file is `{ path, language, text }`; language is `javascript`, `python`, `html`, `css`, or `text`. The `encode` operation alone returns `{ content: CodeDocument, assets: [] }`. The conditional return type preserves this distinction at each call site.

Operations are `new({language?})`, `decode({content})`, `encode({value})`, `put({value,file})`, `import({value,path,language,bytes})`, `rename({value,path,to})`, `remove({value,path})`, and `entry({value,path})`; each request also carries the matching `operation` field. Invalid content raises `CodeContentError`. Paths are unique portable relative paths. Text imports use fatal UTF-8 decoding. Limits are 128 files, 1 MiB per file, 4 MiB per project, and 240 characters per path. No operation executes source.

```ts
const runtime = createCodeRuntime({ root, onEvent });
await runtime.run(document.files, document.entry, entryFile.language);
runtime.stop();
runtime.dispose();
```

`root` must be connected to a live document. Construction performs no run. Events are either `{type:'status',status:'loading'|'running'|'done'|'stopped'}` or `{type:'stdout'|'stderr'|'error',text:string}`. The promise settles on completion, a reported error, Stop, or disposal. Starting another run stops the previous one. Each run gets fresh worker state and a fresh Python memory filesystem. A host must render event text as text, never HTML; `done` means execution ended, not that source succeeded.

Visible capability copy:

> JavaScript runs the entry file in an isolated worker; local module imports and browser DOM APIs are unavailable. Python supports project-local imports and the bundled standard library. HTML/CSS preview does not run scripts.

## Execution boundary

The editor validates the source and sends it to a trusted broker in an iframe with `sandbox="allow-scripts"`, without `allow-same-origin`. The broker creates a module worker from a fixed, trusted data URL. Real Chrome reports the worker origin as `null`; IndexedDB access raises `SecurityError`. The [Storage Standard](https://storage.spec.whatwg.org/#obtain-a-storage-key) rejects storage keys for opaque origins.

The frame installs this policy before its broker script:

```text
default-src 'none';
script-src 'nonce-<random>' blob: 'wasm-unsafe-eval';
worker-src data:;
connect-src 'none';
base-uri 'none';
form-action 'none';
```

Data-URL workers inherit the creating document's policy, as described in [MDN's worker CSP documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#content_security_policy). This blocks fetch, XHR, WebSocket, and HTTP module imports even if user code replaces JavaScript wrappers. The tested fetch, WebSocket, and HTTP-import attempts produce no requests at the probe server. Python's unrestricted JavaScript bridge stays inside this same worker boundary. Subworker constructors are unavailable.

Chrome rejected an opaque-origin **blob module worker** in the initial probe. A data-URL module bootstrap works with the same opaque origin and deny-network policy. This is a browser-tested compatibility choice; no origin permission is relaxed. Pyodide [requires module workers](https://pyodide.org/en/stable/usage/webworker.html). Do not replace this with an editor-origin worker.

Stop is owned outside the executing worker. The broker calls [`Worker.terminate()`](https://developer.mozilla.org/en-US/docs/Web/API/Worker/terminate); source cannot catch it as a Python exception. The host removes the frame and settles its promise. The host also imposes a 30-second loading deadline and a 30-second execution deadline. Only the first `running` event can start the execution deadline.

Worker messages are untrusted. The broker and host validate recognized text/status events; there are no file, editor, navigation, or network commands. Limits are 4,096 characters per message, 131,072 output characters per run, and 1,024 worker messages per run, including empty or invalid messages. Exceeding a limit terminates the worker and reports the reason. These are character limits, not byte limits.

## Python assets and filesystem

The pinned npm package is `pyodide@314.0.7`. Its loader and engine are imported as raw source strings; the wasm, standard-library ZIP, and lock JSON are fixed build asset URLs. No vendor loader runs in the editor. The host reads fixed same-origin assets with credentials omitted and sends bytes to the opaque worker. The worker uses a two-entry in-memory fetch map for the engine's wasm and stdlib requests. Unknown requests fail; the map never delegates to browser fetch. Package installation and automatic package loading are absent.

The engine hook `createPyodideModule` is version-sensitive. The pinned [Pyodide source](https://github.com/pyodide/pyodide/blob/314.0.7/src/js/pyodide.ts) and [Emscripten settings](https://github.com/pyodide/pyodide/blob/314.0.7/src/js/emscripten-settings.ts) define the loader behavior used here. Review this boundary and rerun all browser tests before changing that dependency. Distribution licenses are tracked by the application packaging work.

Validated source files are written under `/project` in memory. Python uses its normal script execution rules through `runpy.run_path`, with the entry directory on `sys.path`. Local modules and bundled standard-library modules work. External packages, stdin interaction, native host files, sockets, and a persistent REPL are outside this contract. Modules absent from the bundle report an error rather than downloading a package.

Successful asset bytes are cached for the current page. Failed loading can be retried. The browser test warms Python, disables browser networking, and successfully runs Python again. This proves a warm in-page offline run. It does **not** prove cold offline application startup or service-worker installation: the deployment must retain every static asset, and those product-level offline tests remain required. A loopback distribution serves the same local assets without internet access.

## HTML/CSS preview

Preview uses a separate iframe with an empty sandbox token list and no scripts. An inert template allowlist removes scripts, frames, forms, navigation attributes, metadata, and non-HTML namespaces. Local linked stylesheets are included by their exact relative project path; external CSS imports are unavailable. Inline raster data images are supported; external images are removed. CSS is escaped before insertion into raw style elements so it cannot create navigation markup. A CSP denies network resources and navigation through forms. The visible note always states that HTML/CSS preview does not run scripts.

This is a static HTML/CSS preview. It is not a DOM JavaScript environment. JS source runs separately in the worker, and local ES module imports are not rewritten or bundled.

## Verification and demo

```sh
node --import tsx --test src/code/code-document.test.ts
node node_modules/@playwright/test/cli.js test --config src/code/code-runtime.playwright.config.ts
node node_modules/typescript/bin/tsc --noEmit
```

The browser suite builds only K02 and dependencies into a fresh temporary directory and serves it on loopback port 4189. It never changes application `dist/`. `CODE_RUNTIME_TEST_TMP` can select a temporary parent directory. Chrome is the tested browser; other browsers remain unverified. The fixture uses the application's COOP, COEP, and CORP headers and asserts `crossOriginIsolated`.

The JavaScript demo prints `answer 42 undefined`; the last value confirms that a worker has no `document`. The Python fixture imports a project-local module and prints `9.0 42`. Contract tests cover errors, Stop and restart during real infinite loops in both engines, storage/network denial, missing asset retry, warm offline execution, bounded console and direct message floods, disposal, no execution at construction, and script-free preview including CSS markup escape attempts. Stop also waits for the browser's worker target to disappear. The build checks the total isolated runtime payload is below 25 MiB.

Verified 2026-11-13: K01 **4/4**, K02 production browser suite **8/8**, isolated runtime assets **13,548,224 bytes**, TypeScript **exit 0**, and the modular checker **PASS** for all seven implementation files. A focused rerun with the worker-target closure assertions passed **1/1**. These are GREEN verification results, not owner acceptance or full-application/offline-distribution acceptance.

Tuning lives in the document's named size constants, the frame's loading/execution deadlines, the broker's message/output limits, and the preview's tag/attribute allowlists. The matching document boundary tests and runtime browser tests gate changes. Keep frame, broker, and worker output constants consistent. Do not add network or same-origin sandbox permissions to solve a loader error.

## Remaining limits

Browser engines provide no enforced per-worker memory quota here. Deliberate memory exhaustion or a browser-engine defect can still terminate a renderer; output caps are not a process memory sandbox. The host must continue using normal document recovery. There is no proof for Firefox, Safari, cold offline startup, or hostile browser extensions. Runtime-file bundling and CSP behavior must be reverified in the final hosted and local application builds. JavaScript module graphs and browser-DOM scripting require separately scoped and tested designs.
