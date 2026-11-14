/**
 * PURPOSE    Control explicit isolated source execution.
 * KIND       SHELL
 * CONTRACT   IN: live root and onEvent callback; run(files,entry,language), stop, dispose.
 *            OUT: run promise settles on completion, error or Stop; validated text/status events.
 *            RAISES: TypeError for an invalid host; operational errors are event.type=error.
 * GUARANTEES No automatic execution; fresh opaque-origin worker per run, no editor storage or
 *            network access; HTML/CSS preview is script-free. Stop terminates the worker.
 * TUNING     Execution/output limits belong to the isolated frame adapter.
 * DECISIONS  D1: Hard termination. Alternative: Python signals; signals are catchable and cannot
 *            stop arbitrary JS. Revisit if a separate cooperative Pause feature is requested.
 * LIMITS     Entry-file JS only, no DOM/npm/relative JS imports; Python project imports and
 *            bundled stdlib only. Browser process memory is not individually quota-controlled.
 * TESTBENCH  src/code/code-runtime.browser.spec.ts -- see dev/CODE-RUNTIME.md for isolated command
 */
import { codeDocument, type CodeDocument } from './code-document.ts';
import { executeCodeFrame } from './code-runtime-frame.ts';
import { previewCode } from './code-runtime-preview.ts';
export type CodeRuntimeEvent = { type: 'status'; status: 'loading' | 'running' | 'done' | 'stopped' } | { type: 'stdout' | 'stderr' | 'error'; text: string };
type Request = { root: HTMLElement; onEvent(event: CodeRuntimeEvent): void };
export function createCodeRuntime({ root, onEvent }: Request): { run(files: CodeDocument['files'], entry: string, language: CodeDocument['files'][number]['language']): Promise<void>; stop(): void; dispose(): void } {
  if (!root?.isConnected || !root.ownerDocument.defaultView) throw new TypeError('A live runtime host is required.');
  let controller: AbortController | undefined, disposed = false;
  const stop = () => { controller?.abort(); controller = undefined; root.replaceChildren(); };
  return {
    async run(files, entry, language) {
      if (disposed) return; stop(); const active = new AbortController(); controller = active;
      const emit = (event: CodeRuntimeEvent) => { if (!disposed && controller === active) onEvent(event); };
      emit({ type: 'status', status: 'loading' });
      try {
        const value = codeDocument({ operation: 'decode', content: { files, entry } });
        if (value.files.find(file => file.path === entry)!.language !== language) throw new Error('Entry language does not match its source file.');
        if (language === 'html' || language === 'css') { previewCode(root, value); emit({ type: 'status', status: 'done' }); }
        else if (language === 'javascript' || language === 'python') await executeCodeFrame({ root, input: { files: value.files, entry, language }, signal: active.signal, emit });
        else throw new Error('Choose JavaScript, Python, HTML or CSS to run.');
      } catch (cause) { emit({ type: 'error', text: String(cause).slice(0, 4096) }); emit({ type: 'status', status: 'done' }); }
      finally { if (controller === active) controller = undefined; }
    },
    stop, dispose() { if (disposed) return; stop(); disposed = true; },
  };
}
