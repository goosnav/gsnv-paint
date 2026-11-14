# Code editing workflow

K03 supplies a locally bundled CodeMirror source editor. K04 assembles it with the immutable K01 source document, shared project history and the K02 isolated runtime. The production factory is `createCodeWorkspace(files): WorkspaceAdapter` from `src/code/code-workspace.ts`. It creates and decodes `gsnv-code` version 1 projects and never executes source while mounting or opening a project.

## Editing and files

Create a JavaScript project, then use New file to choose a relative path and language. The project file list displays complete paths, while tabs display basenames with complete-path tooltips. Arrow Left/Right and Home/End move between tabs. The selected file controls the editor; Entry selects the file Run will execute. Renaming a file does not change its selected language. Removing the last file is disabled.

JavaScript, Python, HTML and CSS have syntax highlighting. Text files use a plain editor. Tab indents by two spaces, Find or Ctrl/Cmd+F opens search/replace, and Escape exits the editor to Run. Ctrl/Cmd+Enter explicitly runs the entry file. There is no CodeMirror undo stack: typing, file edits and source imports share the application's Undo/Redo history.

Typing is grouped after 400 ms of inactivity. A synchronous `flush()` commits pending text before Save, Undo/Redo, file actions, Run, replacement or unload. Invalid pending content stays editable and prevents a misleading save. Reduce the source to the displayed limit, then save again. Disposal attempts a final flush and always cleans the editor and runtime; the shared shell owns before-unload warnings and durable recovery acknowledgments.

Import source accepts one local UTF-8 text file. A duplicate name, malformed UTF-8, unsafe path or a project changed during an asynchronous read leaves the existing source intact. Imports over 1 MiB are rejected from `File.size` before any payload read. Export source writes the selected file with its basename and exact UTF-8 text. Browser download success means handoff to the browser; native writes wait for the file port to close. Cancellation and failed writes are not reported as saved.

The normal File Save/Open workflow retains the complete project, entry selection, source languages and source text. Limits are 128 files, 1 MiB per file and 4 MiB per project. The file list supports nested relative paths; directory selection, directory moves, binary assets, ZIP import, terminals, remote packages and language servers are outside this version.

## Running code

The workspace always displays this capability statement:

> JavaScript runs the entry file in an isolated worker; local module imports and browser DOM APIs are unavailable. Python supports project-local imports and the bundled standard library. HTML/CSS preview does not run scripts.

Run creates fresh execution state. Stop terminates the worker, including real infinite loops. The console is bounded and uses text nodes. A repeated run clears previous output; opening another project clears execution and output. HTML/CSS preview occupies the output area and explicitly labels its script-free behavior. The runtime is loaded lazily only after Run; it never fetches a CDN or external package. The boundary, exact limits, Pyodide asset handling and browser security tests are documented in [CODE-RUNTIME.md](CODE-RUNTIME.md).

## Testbench

```sh
node --import tsx --test src/code/code-document.test.ts src/code/code-files.test.ts src/code/code-workspace.test.ts
node node_modules/@playwright/test/cli.js test --config src/code/code-workspace.playwright.config.ts
node node_modules/@playwright/test/cli.js test --config src/code/code-runtime.playwright.config.ts
node node_modules/typescript/bin/tsc --noEmit
```

K03 uses an isolated editor fixture on port 4190. K04 builds the workspace and shared shell to a temporary production directory and serves port 4191 with the product's isolation headers. Neither changes the application `dist/`. `CODE_RUNTIME_TEST_TMP` selects the temporary parent. To test a coordinated, already-built full application instead, set `CODE_WORKSPACE_APP=1` and select `--grep K04`; that mode only serves the existing shared `dist/` and never rebuilds it.

The browser tests exercise immediate native save, shared undo/redo, multi-file rename/delete/import/export/reopen, project rename during pending typing, script-free reopen, JS/Python run/error/Stop/restart, styled HTML/CSS preview, invalid paths, duplicate import, invalid UTF-8, oversized pending text, keyboard navigation and disposal. They collect page errors and outbound HTTP requests and capture the workspace at 1280×720. Native picker dialogs are replaced with the browser's file-input/download fallback in this automated flow; platform-native picker UX remains a separate manual check.

Verified 2026-11-13: source/document/native unit tests **9/9**; K03/K04 browser suite **6/6** in 13.3 seconds, including the pending project-rename regression; isolated production assets **14,230,811 bytes**; modular checker **PASS** for the five editor/workspace implementation files. The coordinated full-application production run passed **4/4 K04 tests** in 10.9 seconds against the assembled application `dist/`, including JavaScript, bundled Python with a local module, styled HTML/CSS preview, and native persistence. Both browser flows recorded no page errors or outbound HTTP requests. The full-app 1280×720 screenshot was inspected. These are GREEN verification results, not owner acceptance.

Full application service-worker installation, cold offline startup, distribution launchers and Firefox/Safari remain separate integration gates. Passing these focused modules does not mark those gates accepted.
