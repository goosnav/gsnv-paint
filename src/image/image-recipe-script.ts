/**
 * PURPOSE    Run explicitly requested Image action scripts.
 * KIND       SHELL
 * CONTRACT   createRecipeScript({root}) returns run(source,image), stop(), dispose().
 *            run resolves to a validated recipe; failures/Stop reject without a
 *            partial recipe. RAISES: invalid host, source, result, execution or abort.
 * GUARANTEES Fresh opaque worker via executeCodeFrame; no source execution on create;
 *            metadata only, no pixels/file handles; messages never dispatch commands.
 * TUNING     64 KiB source, 128 KiB UTF-8 output; existing 30-second runner deadline.
 * DECISIONS  D1: Reuse isolated Code runner. Alternative: a second sandbox;
 *            rejected to keep one audited boundary. Revisit if structured results
 *            become a native capability of that shared runner.
 * LIMITS     JavaScript only; no DOM, files, network or app storage. Browser process
 *            memory has no per-worker quota; Stop hard-terminates active execution.
 * TESTBENCH  src/image/image-recipe-script.browser.spec.ts
 * DEMO       node --import tsx src/image/image-recipe-script.demo.ts
 */
import { executeCodeFrame } from '../code/code-runtime-frame.ts';
import { recipeScriptProgram, recipeScriptResult, SCRIPT_LIMITS, type RecipeScriptImage } from './image-recipe-script-program.ts';
import type { ImageRecipe } from './image-operation-types.ts';
export function createRecipeScript({ root }: { root: HTMLElement }): { run(source: string, image: RecipeScriptImage): Promise<ImageRecipe>; stop(): void; dispose(): void } {
  if (!root?.isConnected || !root.ownerDocument.defaultView) throw new TypeError('A live action script host is required.');
  let current: AbortController | null = null, disposed = false;
  const stop = () => { current?.abort(); current = null; };
  return {
    async run(source, image) {
      if (disposed) throw new Error('The action script runner has been disposed.');
      stop();
      const runId = crypto.randomUUID(), program = recipeScriptProgram(source, image, runId), dimensions = { width: image.width, height: image.height, layerCount: image.layerCount }, controller = new AbortController(); current = controller;
      let output = '', outputBytes = 0, failure = '', done = false, stopped = false;
      try {
        await executeCodeFrame({ root, input: { files: [{ path: 'action.js', language: 'javascript', text: program }], entry: 'action.js', language: 'javascript' }, signal: controller.signal, emit(event) {
          if (current !== controller) return;
          if (event.type === 'stdout') {
            outputBytes += new TextEncoder().encode(event.text).byteLength;
            if (outputBytes > SCRIPT_LIMITS.resultBytes) { failure = 'Script result exceeds 128 KiB.'; controller.abort(); return; }
            output += event.text;
          } else if (event.type === 'error' || event.type === 'stderr') failure ||= event.text.slice(0, 4096);
          else if (event.type === 'status') { done ||= event.status === 'done'; stopped ||= event.status === 'stopped'; }
        } });
        if (failure) throw new Error(failure);
        if (controller.signal.aborted || stopped || current !== controller) throw new DOMException('Action script stopped.', 'AbortError');
        if (!done) throw new Error('Action script did not complete.');
        return recipeScriptResult(output, dimensions, runId);
      } finally { if (current === controller) current = null; }
    },
    stop,
    dispose() { if (disposed) return; disposed = true; stop(); },
  };
}
