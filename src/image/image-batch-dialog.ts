/**
 * PURPOSE    Guide explicit previewed Image batch processing.
 * KIND       SHELL
 * CONTRACT   imageBatchDialog(ports) returns a Close-only DialogSpec. Body buttons
 *            explicitly select inputs, preview distinct sizes, run, stop or download.
 *            RAISES: invalid recipe on creation; operational errors remain visible.
 * GUARANTEES No automatic run or original write; sequential previews; current-run
 *            guards ignore stale completions. Destination picker starts on Run click.
 * TUNING     At most 25 distinct preview sizes; two <=160×120 thumbnails per size.
 * DECISIONS  D1: Assembly of file/recipe/output/run seams. Alternative: run on modal
 *            confirmation; rejected because Close must never process files.
 *            Revisit if: recursive input folders or streaming previews are approved.
 * LIMITS     Browser decode/encode cancellation latency belongs to those APIs.
 *            Native folder output retains completed files; cancelled ZIP is discarded.
 * TESTBENCH  node --import tsx --test src/image/image-batch-dialog.test.ts
 * DEMO       node --import tsx src/image/image-batch-dialog.demo.ts
 */
import type { DialogSpec } from '../shared/dialog.ts';
import { imageRecipe } from './image-recipe.ts';
import { mergedImage } from './image-operations-pixels.ts';
import { imageOutput } from './image-output.ts';
import { pickBatchInputs, createBatchDestination, type BatchFilePorts, type BatchSelection, type BatchDestination, type BatchResult } from './image-batch-files.ts';
import { runImageBatch, type ImageBatchReport } from './image-batch-run.ts';
import type { ImageContent } from './image-content.ts';
import type { ImageRecipe } from './image-operation-types.ts';
type Ports = {
  document: Document; recipe: ImageRecipe; ports: BatchFilePorts;
  decode(file: File): Promise<ImageContent>;
  encode(image: ImageContent, output: 'png' | 'project', name: string): Promise<Blob>;
  replay(image: ImageContent, recipe: ImageRecipe): Promise<ImageContent>;
  stop(): void; onDownload(blob: Blob, name: string): Promise<void>; onClose(): void;
};
const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause)).slice(0, 500);
export function imageBatchDialog(p: Ports): DialogSpec & { previewElement: HTMLElement } {
  const recipe = imageRecipe({ operation: 'validate', value: p.recipe }), d = p.document;
  if (!d?.defaultView || p.ports.document !== d) throw new TypeError('Batch controls need matching browser document ports.');
  const body = d.createElement('div'); body.className = 'image-batch-dialog'; body.style.width = 'min(640px, 74vw)'; body.style.maxWidth = '100%';
  const controls = d.createElement('div'); controls.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
  const makeButton = (text: string) => { const button = d.createElement('button'); button.type = 'button'; button.textContent = text; controls.append(button); return button; };
  const images = makeButton('Choose images'), folder = makeButton('Choose folder'), preview = makeButton('Preview samples'), run = makeButton('Run batch'), stop = makeButton('Stop');
  const selected = d.createElement('p'); selected.textContent = 'Choose images or a folder. Only files directly inside a folder are processed.';
  const label = d.createElement('label'); label.textContent = 'Output destination '; const destinationMode = d.createElement('select'); destinationMode.setAttribute('aria-label', 'Output destination');
  for (const [value, text] of [['source', 'New timestamped folder inside source folder'], ['choose', 'Choose a destination folder on Run'], ['zip', 'Download timestamped ZIP']]) { const option = d.createElement('option'); option.value = value!; option.textContent = text!; destinationMode.append(option); }
  label.append(destinationMode); const destinationNote = d.createElement('p');
  const status = d.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.textContent = 'Nothing runs until you choose Preview samples or Run batch.';
  const progress = d.createElement('progress'); progress.setAttribute('aria-label', 'Batch progress'); progress.max = 1; progress.value = 0; progress.style.width = '100%';
  const errors = d.createElement('ul'); errors.setAttribute('aria-label', 'Preview errors');
  const samples = d.createElement('div'); samples.setAttribute('aria-label', 'Before and after samples'); samples.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;max-height:260px;overflow:auto';
  const results = d.createElement('ol'); results.setAttribute('aria-label', 'Batch file report'); results.style.cssText = 'max-height:160px;overflow:auto';
  const download = d.createElement('button'); download.type = 'button'; download.textContent = 'Download ZIP'; download.hidden = true;
  body.append(controls, selected, label, destinationNote, status, progress, errors, samples, results, download);
  let selection: BatchSelection | null = null, ready = false, busy: 'pick' | 'preview' | 'run' | null = null, closed = false, revision = 0;
  let controller: AbortController | null = null, destination: BatchDestination | null = null, zip: Extract<BatchResult, { kind: 'zip' }> | null = null;
  function update() {
    images.disabled = folder.disabled = destinationMode.disabled = closed || !!busy;
    preview.disabled = closed || !!busy || !selection; run.disabled = closed || !!busy || !ready;
    stop.disabled = closed || !busy || !!controller?.signal.aborted;
    download.disabled = closed || !!busy;
  }
  function outputNote() {
    destinationNote.textContent = destinationMode.value === 'zip' ? 'ZIP output: this browser will download a timestamped archive. Originals stay unchanged.' : destinationMode.value === 'source' ? 'A new timestamped child folder will be created inside the selected source folder.' : 'Run opens a destination folder chooser, then creates a new timestamped child folder. A file chooser cannot reveal the source folder.';
  }
  function configureDestination() {
    destinationMode.options[0]!.disabled = !selection?.sourceDirectory; destinationMode.options[1]!.disabled = !p.ports.showDirectoryPicker;
    destinationMode.value = selection?.sourceDirectory ? 'source' : p.ports.showDirectoryPicker ? 'choose' : 'zip'; outputNote();
  }
  const addError = (name: string, cause: unknown) => { const item = d.createElement('li'); item.textContent = `${name}: ${message(cause)}`; errors.append(item); };
  async function choose(source: 'files' | 'folder') {
    if (closed || busy) return; busy = 'pick'; const token = ++revision; status.textContent = 'Choose the batch inputs…'; update();
    try {
      const value = await pickBatchInputs({ source, ports: p.ports }); if (closed || token !== revision) return;
      if (value) { selection = value; ready = false; samples.replaceChildren(); errors.replaceChildren(); results.replaceChildren(); zip = null; download.hidden = true;
        selected.textContent = `${value.inputs.length} images selected${value.ignored ? `; ${value.ignored} unsupported files or nested folders ignored` : ''}. Output: ${recipe.output === 'png' ? 'PNG' : 'editable Paint projects'}.`;
        configureDestination(); status.textContent = 'Preview samples checks every input and shows one before/after sample for each distinct image size.';
      } else status.textContent = 'Selection cancelled. Existing inputs are unchanged.';
    } catch (cause) { if (!closed && token === revision) status.textContent = message(cause); }
    finally { if (!closed && token === revision) { busy = null; update(); } }
  }
  function thumbnail(image: ImageContent, caption: string): HTMLElement {
    const figure = d.createElement('figure'); figure.style.cssText = 'margin:0;display:inline-flex;flex-direction:column;gap:3px;max-width:50%';
    const raw = imageOutput(mergedImage(image), image.policy), ratio = Math.min(1, 160 / raw.width, 120 / raw.height), width = Math.max(1, Math.round(raw.width * ratio)), height = Math.max(1, Math.round(raw.height * ratio));
    const canvas = d.createElement('canvas'); canvas.width = width; canvas.height = height; canvas.setAttribute('aria-label', `${caption}: ${image.width} by ${image.height} pixels`); canvas.style.cssText = `max-width:100%;height:auto;image-rendering:${image.policy.mode === 'pixel-art' ? 'pixelated' : 'auto'};border:1px solid #7c8896;background:#fff`;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas previews are unavailable in this browser.');
    const pixels = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const sx = Math.min(raw.width - 1, Math.floor((x + .5) * raw.width / width)), sy = Math.min(raw.height - 1, Math.floor((y + .5) * raw.height / height)), at = (sy * raw.width + sx) * 4; pixels.data.set(raw.data.subarray(at, at + 4), (y * width + x) * 4); }
    ctx.putImageData(pixels, 0, 0); const text = d.createElement('figcaption'); text.textContent = `${caption} · ${image.width} × ${image.height}`; figure.append(canvas, text); return figure;
  }
  async function previewSamples() {
    if (closed || busy || !selection) return; const input = selection, token = ++revision; busy = 'preview'; ready = false; errors.replaceChildren(); samples.replaceChildren(); results.replaceChildren();
    const sizes = new Set<string>(); let checked = 0, previewed = 0, failures = 0; update(); progress.max = input.inputs.length; progress.value = 0;
    try {
      for (const item of input.inputs) {
        if (closed || token !== revision) return; status.textContent = `Checking ${checked + 1}/${input.inputs.length}: ${item.name}`;
        let image: ImageContent;
        try { const file = await item.read(); if (closed || token !== revision) return; image = await p.decode(file); }
        catch (cause) { if (closed || token !== revision) return; addError(item.name, cause); checked++; progress.value = checked; continue; }
        if (closed || token !== revision) return; checked++; progress.value = checked; const size = `${image.width}x${image.height}`;
        if (sizes.has(size)) continue;
        if (sizes.size === 25) throw new Error('Preview supports up to 25 distinct image sizes. Split these inputs into smaller batches before running.'); sizes.add(size);
        try {
          const before = thumbnail(image, 'Before'), result = await p.replay(image, recipe); if (closed || token !== revision) return;
          const card = d.createElement('section'), title = d.createElement('p'); title.textContent = `${item.name} · ${image.width} × ${image.height}`; title.style.margin = '0 0 4px';
          card.append(title, before, thumbnail(result, 'After')); samples.append(card); previewed++;
        } catch (cause) { if (closed || token !== revision) return; failures++; addError(item.name, cause); }
      }
      ready = previewed > 0 && failures === 0;
      status.textContent = ready ? `Preview ready: ${previewed} distinct sizes checked across ${checked} inputs. ${errors.children.length ? `${errors.children.length} unreadable inputs will be reported and skipped.` : 'Run batch is ready.'}` : 'No complete preview is ready. Fix the listed preview errors before running.';
    } catch (cause) { if (!closed && token === revision) { ready = false; status.textContent = message(cause); } }
    finally { if (!closed && token === revision) { busy = null; update(); } }
  }
  function showReport(report: ImageBatchReport, target: BatchDestination) {
    results.replaceChildren();
    for (const entry of report.entries) { const item = d.createElement('li'); item.dataset.batchResult = entry.status; item.textContent = entry.status === 'written' ? `${entry.input} → ${entry.output}` : `${entry.input}: ${entry.message}`; results.append(item); }
    const remaining = selection!.inputs.length - report.entries.length;
    status.textContent = `${report.status === 'completed' ? 'Batch complete' : report.status === 'stopped' ? 'Batch stopped' : 'Batch failed'}: ${report.written} files written; ${report.errors.length} errors${remaining ? `; ${remaining} unprocessed` : ''}. ${report.result ? `Output: ${report.result.name}.` : target.kind === 'directory' ? `Completed files remain in ${target.name}.` : 'The incomplete ZIP was discarded.'}`;
    for (const error of report.errors) if (!report.entries.some(entry => entry.input === error.name && entry.message === error.message)) addError(error.name, error.message);
  }
  async function downloadZip() {
    if (!zip || closed) return; download.disabled = true;
    try { await p.onDownload(zip.blob, zip.name); if (!closed) status.textContent += ' ZIP download requested.'; }
    catch (cause) { if (!closed) { status.textContent += ` Download failed: ${message(cause)}. Use Download ZIP to retry.`; } }
    finally { if (!closed) download.disabled = false; }
  }
  async function runBatch() {
    if (closed || busy || !ready || !selection) return; const input = selection, token = ++revision; busy = 'run'; controller = new AbortController(); const active = controller; zip = null; download.hidden = true; results.replaceChildren(); update();
    status.textContent = 'Choosing the output destination…';
    try {
      // This is the first awaited call in the click handler; the native chooser keeps its user gesture.
      const target = await createBatchDestination({ selection: input, mode: destinationMode.value as 'source' | 'choose' | 'zip', now: Date.now(), runId: crypto.randomUUID().slice(0, 8), ports: p.ports });
      if (closed || token !== revision || active.signal.aborted) { await target?.cancel(); if (!closed && token === revision) { ready = false; status.textContent = 'Batch stopped before processing. No files were processed.'; } return; }
      if (!target) { status.textContent = 'Destination selection cancelled. No files were processed.'; return; } destination = target;
      const report = await runImageBatch({ selection: input, destination: target, recipe, decode: p.decode, replay: p.replay, encode: p.encode, signal: active.signal, onProgress(value) {
        if (closed || token !== revision) return; progress.max = value.total; progress.value = value.processed; status.textContent = `${value.processed}/${value.total} processed · ${value.written} written${value.name ? ` · ${value.name}` : ''}`;
      } });
      if (closed || token !== revision) return; showReport(report, target); if (report.status !== 'completed') ready = false;
      if (report.result?.kind === 'zip') { zip = report.result; download.hidden = false; await downloadZip(); }
    } catch (cause) { if (!closed && token === revision) { status.textContent = active.signal.aborted ? 'Batch stopped before processing. No further files will be written.' : message(cause); ready = false; } await destination?.cancel(); }
    finally { if (!closed && token === revision) { controller = null; destination = null; busy = null; update(); } }
  }
  function stopWork() {
    if (!busy || closed) return;
    if (busy === 'run') { controller?.abort(); p.stop(); void destination?.cancel().catch(cause => { if (!closed) addError('Stop', cause); }); status.textContent = 'Stopping batch… Completed folder outputs are retained; an incomplete ZIP is discarded.'; update(); return; }
    const previous = busy; revision++; busy = null; if (previous === 'preview') { p.stop(); ready = false; } status.textContent = previous === 'preview' ? 'Preview stopped. Preview all sizes again before running.' : 'Selection stopped.'; update();
  }
  function close() { if (closed) return; closed = true; revision++; controller?.abort(); if (busy === 'preview' || busy === 'run') p.stop(); void destination?.cancel().catch(() => {}); p.onClose(); }
  images.addEventListener('click', () => { void choose('files'); }); folder.addEventListener('click', () => { void choose('folder'); }); preview.addEventListener('click', () => { void previewSamples(); }); run.addEventListener('click', () => { void runBatch(); }); stop.addEventListener('click', stopWork); download.addEventListener('click', () => { void downloadZip(); }); destinationMode.addEventListener('change', outputNote);
  body.addEventListener('keydown', event => { if (event.key !== 'Enter' || event.isComposing) return; event.stopPropagation(); const target = event.target as HTMLElement; if (target.tagName === 'BUTTON') { event.preventDefault(); (target as HTMLButtonElement).click(); } });
  configureDestination(); update();
  return { title: 'Batch process images', description: `Action: ${recipe.name}. Preview copies first, then save results into a new folder or ZIP.`, confirmLabel: 'Close', previewElement: body, fields: [], initial: {}, validate: () => ({ ok: true, value: null }), preview() {}, commit: close, cancel: close };
}
