/**
 * PURPOSE    Present a transactional live-preview modal.
 * KIND       SHELL
 * CONTRACT   IN: DialogRequest with a live root, unique nonempty field keys, matching
 *            typed initial values, valid bounds/choices and synchronous callbacks.
 *            OUT: close() cancels once; valid initial values and edits preview the
 *            validator's result.value; OK/Enter commits that same value once;
 *            Cancel/Esc/native dismissal cancels once, closes and restores focus.
 *            Invalid values show an error, disable OK and never preview or commit.
 *            Tab stays inside the modal. Blank numbers are invalid; omitted step=any.
 *            RAISES: TypeError for invalid root, fields, initial values or callbacks.
 * GUARANTEES No domain decisions, initial-value mutation or implicit document commit.
 *            Supplied labels are text; terminal actions and disposal are idempotent.
 * TUNING     Dialog width and XP colors live in dialog.css; host loads the stylesheet.
 * DECISIONS  D1: Use native modal dialog plus explicit keyboard routing. Alternative:
 *            a positioned div; rejected because native modal isolation blocks the
 *            background. Revisit if: target browsers stop supporting native dialogs.
 *            D2: Preview/commit validated output. Alternative: preview raw fields;
 *            rejected because normalized dimensions could differ at commit time.
 *            Revisit if: validation becomes an explicitly asynchronous transaction.
 * LIMITS     Caller owns domain validation, immutable values and cancel rollback.
 *            Callbacks are synchronous; their exceptions propagate. Native modal
 *            support is required; unavailable support raises a readable TypeError.
 * TESTBENCH  src/shared/dialog.test.ts -- run with: node --import tsx --test src/shared/dialog.test.ts
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Values = Record<string, string | number | boolean>;
type FieldBase = { key: string; label: string };
type Field = FieldBase & ({ type: 'text'; placeholder?: string } | { type: 'number'; min?: number; max?: number; step?: number } | { type: 'checkbox' } | { type: 'select'; choices: readonly { value: string; label: string }[] });
export type DialogSpec = {
  title: string; fields: readonly Field[]; initial: Values;
  validate(values: Values): { ok: true; value: Json } | { ok: false; error: { code: string; message: string } };
  preview(value: Json): void; commit(value: Json): void; cancel(): void;
};
export type DialogRequest = { root: HTMLElement; spec: DialogSpec };
function validateSpec(root: HTMLElement, spec: DialogSpec): void {
  if (!root?.ownerDocument || root.nodeType !== 1 || !root.isConnected || !spec || typeof spec.title !== 'string' ||
      !Array.isArray(spec.fields) || !spec.initial || typeof spec.initial !== 'object' ||
      ![spec.validate, spec.preview, spec.commit, spec.cancel].every(callback => typeof callback === 'function')) throw new TypeError('A live dialog root, fields, values and callbacks are required.');
  const keys = new Set<string>();
  for (const field of spec.fields) {
    if (!field || typeof field.key !== 'string' || !field.key || keys.has(field.key) || typeof field.label !== 'string') throw new TypeError('Dialog fields need unique nonempty keys and labels.');
    keys.add(field.key); const initial = spec.initial[field.key];
    if (!Object.hasOwn(spec.initial, field.key)) throw new TypeError(`Missing initial value: ${field.key}.`);
    if (field.type === 'number') {
      if (typeof initial !== 'number' || !Number.isFinite(initial) ||
          [field.min, field.max, field.step].some(value => value !== undefined && !Number.isFinite(value)) ||
          (field.min !== undefined && field.max !== undefined && field.min > field.max) ||
          (field.step !== undefined && field.step <= 0)) throw new TypeError(`Invalid numeric field: ${field.key}.`);
    } else if (field.type === 'select') {
      if (!Array.isArray(field.choices) || !field.choices.length) throw new TypeError('A choice field needs options.');
      const choices = new Set<string>();
      for (const choice of field.choices) {
        if (!choice || typeof choice.value !== 'string' || typeof choice.label !== 'string' || choices.has(choice.value)) throw new TypeError('Choice values must be distinct strings.');
        choices.add(choice.value);
      }
      if (typeof initial !== 'string' || !choices.has(initial)) throw new TypeError('Initial choice is not an option.');
    } else if (field.type === 'checkbox') {
      if (typeof initial !== 'boolean') throw new TypeError('Checkbox values must be boolean.');
    } else if (field.type !== 'text' || typeof initial !== 'string' || (field.placeholder !== undefined && typeof field.placeholder !== 'string')) throw new TypeError('Invalid text field.');
  }
  if (Object.keys(spec.initial).length !== keys.size) throw new TypeError('Initial values must match the fields.');
}

export function showDialog({ root, spec }: DialogRequest): { close(): void } {
  validateSpec(root, spec);
  const document = root.ownerDocument; const opener = document.activeElement as HTMLElement | null;
  const dialog = document.createElement('dialog'); dialog.className = 'gc-dialog'; dialog.setAttribute('aria-label', spec.title);
  if (typeof dialog.showModal !== 'function') throw new TypeError('Modal dialogs are unavailable in this browser.');
  const title = document.createElement('h2'); title.className = 'gc-dialog-title'; title.textContent = spec.title;
  const body = document.createElement('div'); body.className = 'gc-dialog-body';
  const controls = new Map<string, HTMLInputElement | HTMLSelectElement>();
  for (const field of spec.fields) {
    const label = document.createElement('label'); label.className = 'gc-dialog-field';
    const caption = document.createElement('span'); caption.textContent = field.label; label.append(caption);
    const control = document.createElement(field.type === 'select' ? 'select' : 'input'); control.name = field.key;
    control.setAttribute('aria-label', field.label);
    if (field.type === 'select') {
      for (const choice of field.choices) { const option = document.createElement('option'); option.value = choice.value; option.textContent = choice.label; control.append(option); }
      control.value = String(spec.initial[field.key]);
    } else {
      const input = control as HTMLInputElement; input.type = field.type;
      if (field.type === 'checkbox') input.checked = spec.initial[field.key] as boolean;
      else input.value = String(spec.initial[field.key]);
      if (field.type === 'number') {
        input.required = true; input.step = field.step === undefined ? 'any' : String(field.step);
        if (field.min !== undefined) input.min = String(field.min);
        if (field.max !== undefined) input.max = String(field.max);
      }
      if (field.type === 'text' && field.placeholder !== undefined) input.placeholder = field.placeholder;
    }
    controls.set(field.key, control); label.append(control); body.append(label);
  }
  const error = document.createElement('p'); error.className = 'gc-dialog-error'; error.setAttribute('role', 'alert');
  const buttons = document.createElement('div'); buttons.className = 'gc-dialog-buttons';
  const ok = document.createElement('button'); ok.type = 'button'; ok.textContent = 'OK'; ok.title = 'OK (Enter)';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel'; cancel.title = 'Cancel (Esc)';
  buttons.append(ok, cancel); body.append(error, buttons); dialog.append(title, body);
  let settled = false; let valid = false; let validated: Json = null; let revision = 0;
  const refresh = () => {
    if (settled) return;
    const currentRevision = ++revision;
    const values: [string, string | number | boolean][] = []; let message = '';
    for (const field of spec.fields) {
      const control = controls.get(field.key)!; let value: string | number | boolean = control.value;
      if (field.type === 'checkbox') value = (control as HTMLInputElement).checked;
      if (field.type === 'number') value = (control as HTMLInputElement).valueAsNumber;
      const invalid = !control.validity.valid || (field.type === 'number' && !Number.isFinite(value)) ||
        (field.type === 'select' && !field.choices.some(choice => choice.value === value));
      control.setAttribute('aria-invalid', String(invalid));
      if (invalid && !message) message = `${field.label}: ${control.validationMessage || 'Enter a valid value.'}`;
      values.push([field.key, value]);
    }
    valid = false; ok.disabled = true;
    if (message) { error.textContent = message; return; }
    const result = spec.validate(Object.fromEntries(values));
    // Callbacks may edit fields or cancel; only the newest live refresh may finish.
    if (settled || currentRevision !== revision) return;
    if (!result.ok) { error.textContent = result.error.message; return; }
    error.textContent = ''; validated = result.value;
    spec.preview(validated);
    if (settled || currentRevision !== revision) return;
    valid = true; ok.disabled = false;
  };
  const finish = (commit: boolean) => {
    if (settled || (commit && !valid)) return;
    settled = true; cleanup();
    if (dialog.open) dialog.close(); dialog.remove();
    if (opener?.isConnected) opener.focus();
    if (commit) spec.commit(validated); else spec.cancel();
  };
  const commit = () => finish(true); const dismiss = () => finish(false);
  const nativeCancel = (event: Event) => { event.preventDefault(); dismiss(); };
  const keydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
    else if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); event.target === cancel ? dismiss() : commit(); }
    else if (event.key === 'Tab') {
      const focusable = [...controls.values(), ok, cancel].filter(control => !control.disabled);
      const first = focusable[0]!; const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };
  const cleanup = () => {
    dialog.removeEventListener('input', refresh); dialog.removeEventListener('change', refresh); dialog.removeEventListener('keydown', keydown);
    dialog.removeEventListener('cancel', nativeCancel); dialog.removeEventListener('close', dismiss);
    ok.removeEventListener('click', commit); cancel.removeEventListener('click', dismiss);
  };
  dialog.addEventListener('input', refresh); dialog.addEventListener('change', refresh); dialog.addEventListener('keydown', keydown);
  dialog.addEventListener('cancel', nativeCancel); dialog.addEventListener('close', dismiss);
  ok.addEventListener('click', commit); cancel.addEventListener('click', dismiss);
  root.append(dialog);
  try {
    refresh();
    if (!settled) { dialog.showModal(); (controls.values().next().value ?? (valid ? ok : cancel)).focus(); }
  }
  catch (cause) { settled = true; cleanup(); dialog.remove(); if (opener?.isConnected) opener.focus(); throw cause; }
  return { close: dismiss };
}
