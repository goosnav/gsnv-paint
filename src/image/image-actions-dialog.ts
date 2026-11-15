/**
 * PURPOSE    Present an explicit Image action editor.
 * KIND       SHELL
 * CONTRACT   imageActionsDialog accepts recipe, document and caller callbacks; returns
 *            DialogSpec with step controls and explicit Preview on copy/Apply once.
 *            Edits call onChange; Preview calls onPreview, Stop calls onStop. Terminal
 *            close calls onClose once. Optional source enables a Before/After miniature.
 *            RAISES: recipe validation errors at construction; callback errors stay visible.
 * GUARANTEES Opening executes nothing. No image mutation, implicit apply, script execution
 *            or file access. Cancel preserves recipe edits, never applies pixels. Late
 *            preview results after Stop/edit/close are discarded by revision token.
 * TUNING     Thumbnails <=220×140; recipe limits and exact validation belong to CORE.
 * DECISIONS  D1: Host owns preview worker cancellation. Alternative: run replay here;
 *            rejected because large recipes must not block UI. Revisit if: worker API changes.
 * LIMITS     Thumbnail composition runs synchronously after preview; source pixels are
 *            immutable caller snapshots. Shared modal owns focus/Enter/Esc lifecycle.
 * TESTBENCH  node --import tsx --test src/image/image-actions-dialog.test.ts
 * DEMO       npm run dev -- --host 127.0.0.1; open /src/image/image-actions-dialog.demo.html.
 */
import type { DialogSpec } from '../shared/dialog.ts';
import type { ImageContent } from './image-content.ts';
import type { ImageRecipe } from './image-operation-types.ts';
import { imageRecipe } from './image-recipe.ts';
import { mergedImage } from './image-operations-pixels.ts';
import { imageOutput } from './image-output.ts';

export type ImageActionsDialogOptions = {
  document: Document; recipe: ImageRecipe; source?: ImageContent;
  onChange(recipe: ImageRecipe): void; onPreview(recipe: ImageRecipe): Promise<ImageContent>;
  onApply(recipe: ImageRecipe): void; onStop(): void; onClose(): void; onError?(message: string): void;
};
function thumbnail(document: Document, image: ImageContent, label: string): HTMLElement {
  const figure = document.createElement('figure'), canvas = document.createElement('canvas'), caption = document.createElement('figcaption');
  figure.style.margin = '0'; canvas.setAttribute('aria-label', `${label} thumbnail`);
  Object.assign(canvas.style, { display: 'block', maxWidth: '100%', background: 'repeating-conic-gradient(#fff 0 25%,#ddd 0 50%) 0 0 / 8px 8px', border: '1px solid var(--xp-shadow)', imageRendering: image.policy.mode === 'pixel-art' ? 'pixelated' : 'auto' });
  const scale = Math.min(220 / image.width, 140 / image.height, 1); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas preview is unavailable in this browser.');
  const raster = imageOutput(mergedImage(image), image.policy), pixels = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const index = (Math.min(image.height - 1, Math.floor((y + .5) * image.height / canvas.height)) * image.width + Math.min(image.width - 1, Math.floor((x + .5) * image.width / canvas.width))) * 4;
    pixels.data.set(raster.data.subarray(index, index + 4), (y * canvas.width + x) * 4);
  }
  context.putImageData(pixels, 0, 0); caption.textContent = `${label} · ${image.width} × ${image.height} px`; figure.append(canvas, caption); return figure;
}

export function imageActionsDialog(options: ImageActionsDialogOptions): DialogSpec & { previewElement: HTMLElement } {
  const { document } = options;
  if (!document?.createElement || ![options.onChange, options.onPreview, options.onApply, options.onStop, options.onClose].every(callback => typeof callback === 'function')) throw new TypeError('Image actions need a document and edit/preview/apply/stop/close callbacks.');
  let current = imageRecipe({ operation: 'validate', value: options.recipe }), revision = 0, running = false, closed = false, fieldsValid = true;
  const drafts = new Map<string,string>();
  const invalidSteps = new Map<string, string>(), root = document.createElement('section'), list = document.createElement('ol'), previewArea = document.createElement('div'), status = document.createElement('p'), controls = document.createElement('div');
  root.setAttribute('aria-label', 'Action steps and preview'); list.setAttribute('aria-label', 'Action steps');
  Object.assign(list.style, { padding: '0', margin: '0 0 8px', listStyle: 'none', maxHeight: '220px', overflow: 'auto' });
  Object.assign(previewArea.style, { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' });
  Object.assign(controls.style, { display: 'flex', gap: '6px' }); status.setAttribute('role', 'status'); status.textContent = 'Preview on a copy before applying. Your canvas stays unchanged.';
  const refresh = () => { const control = root.closest('dialog')?.querySelector<HTMLInputElement>('[name="name"]'); if (control) control.dispatchEvent(new document.defaultView!.Event('input', { bubbles: true })); };
  const button = (label: string, click: () => void, ariaLabel = label) => {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = label; node.setAttribute('aria-label', ariaLabel);
    node.addEventListener('click', click);
    node.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); node.click(); } }); return node;
  };
  const report = (cause: unknown) => { const message = cause instanceof Error ? cause.message : String(cause); status.textContent = message; options.onError?.(message); };
  const invalidate = (message: string) => { revision++; if (running) { running = false; options.onStop(); } previewArea.replaceChildren(); status.textContent = message; };
  const update = (value: ImageRecipe, redraw = false) => {
    current = imageRecipe({ operation: 'validate', value }); invalidate('Action changed. Preview again to see the result.');
    options.onChange(imageRecipe({ operation: 'validate', value: current })); if (redraw) render();
  };
  const preview = button('Preview on copy', () => { void runPreview(); });
  const stop = button('Stop preview', () => { invalidate('Preview stopped. Your canvas is unchanged.'); state(); refresh(); });
  function state() { preview.disabled = closed || running || !fieldsValid || invalidSteps.size > 0 || !current.steps.some(step => step.enabled); stop.hidden = !running; stop.disabled = !running; root.setAttribute('aria-busy', String(running)); }
  function render() {
    list.replaceChildren();
    if (!current.steps.length) { const empty = document.createElement('li'); empty.textContent = 'No steps yet. Record edits or load an action, then return here.'; list.append(empty); }
    current.steps.forEach((step, index) => {
      const row = document.createElement('li'); row.dataset.stepId = step.id;
      Object.assign(row.style, { padding: '5px', marginBottom: '4px', border: '1px solid var(--xp-shadow)', background: 'var(--xp-window)' });
      const fields = document.createElement('div'); Object.assign(fields.style, { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' });
      const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = step.enabled; enabled.setAttribute('aria-label', `Enable step ${index + 1}`);
      enabled.addEventListener('change', () => { try { update({ ...current, steps: current.steps.map(item => item.id === step.id ? { ...item, enabled: enabled.checked } : item) }); state(); refresh(); } catch (cause) { report(cause); } });
      const label = document.createElement('input'); label.type = 'text'; label.value = drafts.get(step.id)??step.label;label.setAttribute('aria-invalid',String(invalidSteps.has(step.id))); label.maxLength = 256; label.setAttribute('aria-label', `Step ${index + 1} name`); label.style.minWidth = '80px'; label.style.flex = '1';
      label.addEventListener('input', () => {
        drafts.set(step.id,label.value);
        try { update({ ...current, steps: current.steps.map(item => item.id === step.id ? { ...item, label: label.value } : item) }); invalidSteps.delete(step.id);drafts.delete(step.id); label.setAttribute('aria-invalid', 'false'); }
        catch (cause) { const message = cause instanceof Error ? cause.message : 'Enter a step name.'; invalidSteps.set(step.id, message); invalidate(message); label.setAttribute('aria-invalid', 'true'); }
        state();refresh();
      });
      const move = (direction: number) => { const steps = [...current.steps], at = steps.findIndex(item => item.id === step.id), to = at + direction; if (at < 0 || to < 0 || to >= steps.length) return; const [moving] = steps.splice(at, 1); steps.splice(to, 0, moving!); update({ ...current, steps }, true); state(); refresh(); list.querySelector<HTMLInputElement>(`[data-step-id="${step.id}"] input[type="text"]`)?.focus(); };
      const up = button('↑', () => move(-1), `Move step ${index + 1} up`), down = button('↓', () => move(1), `Move step ${index + 1} down`);
      up.disabled = index === 0; down.disabled = index === current.steps.length - 1;
      const remove = button('Remove', () => { invalidSteps.delete(step.id);drafts.delete(step.id); update({ ...current, steps: current.steps.filter(item => item.id !== step.id) }, true); state(); refresh(); }, `Remove step ${index + 1}`);
      const details = document.createElement('details'), summary = document.createElement('summary'), code = document.createElement('pre'); summary.textContent = `${step.operation.kind} · recorded at ${step.reference.width} × ${step.reference.height} px`; code.textContent = JSON.stringify(step.operation, null, 2); code.style.whiteSpace = 'pre-wrap'; code.style.overflowWrap = 'anywhere'; details.append(summary, code);
      details.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target === summary) { event.preventDefault(); event.stopPropagation(); details.open = !details.open; } });
      fields.append(enabled, label, up, down, remove); row.append(fields, details); list.append(row);
    });
  }
  async function runPreview() {
    if (preview.disabled || closed) return; const token = ++revision; running = true; status.textContent = 'Preparing preview on a copy…'; state(); refresh();
    try {
      const result = await options.onPreview(imageRecipe({ operation: 'validate', value: current })); if (closed || token !== revision) return;
      const thumbnails = [...(options.source ? [thumbnail(document, options.source, 'Source')] : []), thumbnail(document, result, 'Preview')]; previewArea.replaceChildren(...thumbnails);
      status.textContent = 'Preview ready. Apply once changes your canvas in one undo step.';
    } catch (cause) { if (!closed && token === revision) report(cause); }
    finally { if (!closed && token === revision) { running = false; state(); refresh(); } }
  }
  const close = () => { if (closed) return; closed = true; revision++; if (running) { running = false; options.onStop(); } state(); options.onClose(); };
  previewArea.textContent = options.source ? `Source · ${options.source.width} × ${options.source.height} px. Preview compares both images here.` : 'Preview appears here after you request it.';
  controls.append(preview, stop); root.append(list, controls, previewArea, status); render(); state();
  return {
    title: 'Image actions', confirmLabel: 'Apply once', description: 'Edit the action below. Preview runs only when requested; Cancel keeps action edits without changing the image.', previewElement: root,
    fields: [{ key: 'name', label: 'Action name', type: 'text' }, { key: 'output', label: 'Output', type: 'select', choices: [{ value: 'png', label: 'PNG image' }, { value: 'project', label: 'Editable Paint project' }] }],
    initial: { name: current.name, output: current.output },
    validate(values) {
      fieldsValid = false;
      try {
        if (values.name !== current.name || values.output !== current.output) update({ ...current, name: values.name as string, output: values.output as ImageRecipe['output'] });
        fieldsValid = true; state();
        if (invalidSteps.size) throw new Error([...invalidSteps.values()][0]);
        if (!current.steps.some(step => step.enabled)) throw new Error('Enable at least one step to preview or apply this action.');
        if (running) throw new Error('Preview is running. Stop it before applying.');
        return { ok: true, value: { name: current.name, output: current.output } };
      } catch (cause) { state(); return { ok: false, error: { code: 'image.actions', message: cause instanceof Error ? cause.message : 'Invalid action settings.' } }; }
    },
    preview() {},
    commit() { if (closed || running || !fieldsValid || invalidSteps.size || !current.steps.some(step => step.enabled)) return; const value = imageRecipe({ operation: 'validate', value: current }); close(); options.onApply(value); },
    cancel: close,
  };
}
