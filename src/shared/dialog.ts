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
 *            Optional description and confirmLabel are literal text; confirmation defaults to OK.
 *            Color fields use six-digit hex strings and native color controls.
 *            Select fields may asynchronously load/import choices; pending work blocks commit.
 *            Errors retain fields; dismissal ignores late results; caller choices stay immutable.
 *            Optional onChange and field actions return atomic typed field patches before
 *            validation, including recovery from incomplete numbers. Actions never commit.
 *            Textarea and select Enter stay native and stop before app shortcuts;
 *            Ctrl/Cmd+Enter confirms. IME composition remains native.
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
type Choice = { value: string; label: string; notice?: string };
type FieldBase = { key: string; label: string; layout?: 'stacked'; action?: { label: string; update(values: Readonly<Values>): Partial<Values> } };
type Field = FieldBase & ({ type: 'text'; placeholder?: string; multiline?: boolean } | { type: 'number'; min?: number; max?: number; step?: number } | { type: 'checkbox' } | { type: 'color' } | { type: 'select'; choices: readonly Choice[]; loadChoices?: () => Promise<{ choices: Choice[]; notice?: string }>; importChoice?: { label: string; run(): Promise<Choice | null> } });
export type DialogSpec = {
  title: string; previewElement?: HTMLElement; description?: string; confirmLabel?: string; fields: readonly Field[]; initial: Values;
  onChange?(key: string, values: Readonly<Values>): Partial<Values>;
  validate(values: Values): { ok: true; value: Json } | { ok: false; error: { code: string; message: string } };
  preview(value: Json): void; commit(value: Json): void; cancel(): void;
};
export type DialogRequest = { root: HTMLElement; spec: DialogSpec };
function validateSpec(root: HTMLElement, spec: DialogSpec): void {
  if (!root?.ownerDocument || root.nodeType !== 1 || !root.isConnected || !spec || typeof spec.title !== 'string' ||
      (spec.description !== undefined && typeof spec.description !== 'string') || (spec.confirmLabel !== undefined && (typeof spec.confirmLabel !== 'string' || !spec.confirmLabel.trim())) ||
      !Array.isArray(spec.fields) || !spec.initial || typeof spec.initial !== 'object' || (spec.onChange !== undefined && typeof spec.onChange !== 'function') ||
      ![spec.validate, spec.preview, spec.commit, spec.cancel].every(callback => typeof callback === 'function')) throw new TypeError('A live dialog root, fields, values and callbacks are required.');
  const keys = new Set<string>();
  for (const field of spec.fields) {
    if (!field || typeof field.key !== 'string' || !field.key || keys.has(field.key) || typeof field.label !== 'string') throw new TypeError('Dialog fields need unique nonempty keys and labels.');
    if ((field.layout !== undefined && field.layout !== 'stacked') || (field.action !== undefined && (!field.action || typeof field.action.label !== 'string' || !field.action.label.trim() || typeof field.action.update !== 'function'))) throw new TypeError('Invalid dialog field layout or action.');
    keys.add(field.key); const initial = spec.initial[field.key];
    if (!Object.hasOwn(spec.initial, field.key)) throw new TypeError(`Missing initial value: ${field.key}.`);
    if (field.type === 'number') {
      if (typeof initial !== 'number' || !Number.isFinite(initial) ||
          [field.min, field.max, field.step].some(value => value !== undefined && !Number.isFinite(value)) ||
          (field.min !== undefined && field.max !== undefined && field.min > field.max) ||
          (field.step !== undefined && field.step <= 0)) throw new TypeError(`Invalid numeric field: ${field.key}.`);
    } else if (field.type === 'select') {
      if (!Array.isArray(field.choices) || !field.choices.length) throw new TypeError('A choice field needs options.');
      if (field.loadChoices !== undefined && typeof field.loadChoices !== 'function') throw new TypeError('Invalid choice loader.');
      if (field.importChoice && (typeof field.importChoice.label !== 'string' || !field.importChoice.label.trim() || typeof field.importChoice.run !== 'function')) throw new TypeError('Invalid choice importer.');
      const choices = new Set<string>();
      for (const choice of field.choices) {
        if (!choice || typeof choice.value !== 'string' || typeof choice.label !== 'string' || choices.has(choice.value)) throw new TypeError('Choice values must be distinct strings.');
        choices.add(choice.value);
      }
      if (typeof initial !== 'string' || !choices.has(initial)) throw new TypeError('Initial choice is not an option.');
    } else if (field.type === 'checkbox') {
      if (typeof initial !== 'boolean') throw new TypeError('Checkbox values must be boolean.');
    } else if (field.type === 'color') {
      if (typeof initial !== 'string' || !/^#[0-9a-f]{6}$/i.test(initial)) throw new TypeError('Color values must be six-digit hex strings.');
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
  if (spec.description) { const description=document.createElement('p');description.className='gc-dialog-description';description.textContent=spec.description;body.append(description); }
  if (spec.previewElement) { if (spec.previewElement.ownerDocument !== document) throw new TypeError('Dialog preview must belong to the same document.'); body.append(spec.previewElement); }
  const controls = new Map<string, HTMLInputElement | HTMLSelectElement>();
  const allowed = new Map<string, Set<string>>(), imports: HTMLButtonElement[] = [], actions: HTMLButtonElement[] = [];
  for (const field of spec.fields) {
    const label = document.createElement('label'); label.className = 'gc-dialog-field';
    if (field.layout === 'stacked') label.classList.add('gc-dialog-field-stacked');
    const caption = document.createElement('span'); caption.textContent = field.label; label.append(caption);
    const control = document.createElement(field.type === 'select' ? 'select' : field.type === 'text' && field.multiline ? 'textarea' : 'input') as HTMLInputElement | HTMLSelectElement; control.name = field.key;
    control.setAttribute('aria-label', field.label);
    if (field.type === 'select') {
      allowed.set(field.key, new Set(field.choices.map(c => c.value)));
      for (const choice of field.choices) { const option = document.createElement('option'); option.value = choice.value; option.textContent = choice.label; control.append(option); }
      control.value = String(spec.initial[field.key]);
    } else {
      const input = control as HTMLInputElement; if (input.tagName !== 'TEXTAREA') input.type = field.type; else (input as unknown as HTMLTextAreaElement).rows = 3;
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
    if (field.action) {
      const action = document.createElement('div'); action.className = 'gc-dialog-field-action';
      if (field.layout === 'stacked') action.classList.add('gc-dialog-field-action-stacked');
      const button = document.createElement('button'); button.type = 'button'; button.textContent = field.action.label;
      button.addEventListener('click', () => {
        if (settled || pending) return;
        const currentRevision = ++revision; valid = false; ok.disabled = true;
        const patch = field.action!.update(Object.freeze(readValues()));
        if (settled || currentRevision !== revision) return;
        applyPatch(patch); refresh();
      });
      actions.push(button); action.append(button); body.append(action);
    }
    if (field.type === 'select' && field.importChoice) {
      const action = document.createElement('div'); action.className = 'gc-dialog-field-action';
      const button = document.createElement('button'); button.type = 'button'; button.textContent = field.importChoice.label;
      button.addEventListener('click', () => { void extend(field, true); }); imports.push(button); action.append(button); body.append(action);
    }
  }
  const error = document.createElement('p'); error.className = 'gc-dialog-error'; error.setAttribute('role', 'alert');
  const buttons = document.createElement('div'); buttons.className = 'gc-dialog-buttons';
  const ok = document.createElement('button'); ok.type = 'button'; ok.textContent = spec.confirmLabel ?? 'OK'; ok.title = `${ok.textContent} (Enter)`;
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel'; cancel.title = 'Cancel (Esc)';
  const notice = document.createElement('p'); notice.className = 'gc-dialog-notice'; notice.setAttribute('role', 'status'); notice.hidden = true;
  buttons.append(ok, cancel); body.append(notice, error, buttons); dialog.append(title, body);
  let settled = false; let valid = false; let validated: Json = null; let revision = 0; let pending = 0;
  const readValues = (): Values => Object.fromEntries(spec.fields.map(field => {
    const control = controls.get(field.key)!;
    return [field.key, field.type === 'checkbox' ? (control as HTMLInputElement).checked : field.type === 'number' ? (control as HTMLInputElement).valueAsNumber : control.value];
  }));
  const applyPatch = (patch: Partial<Values>) => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Dialog updates must return a field patch.');
    const entries = Object.entries(patch);
    // Check the complete patch before touching any controls; bad patches cannot half-apply.
    for (const [key, value] of entries) {
      const field = spec.fields.find(candidate => candidate.key === key);
      if (!field || (field.type === 'number' ? typeof value !== 'number' || !Number.isFinite(value) : field.type === 'checkbox' ? typeof value !== 'boolean' : typeof value !== 'string') ||
          (field.type === 'color' && !/^#[0-9a-f]{6}$/i.test(String(value))) || (field.type === 'select' && !allowed.get(key)!.has(String(value)))) throw new TypeError(`Invalid dialog update: ${key}.`);
    }
    for (const [key, value] of entries) {
      const control = controls.get(key)!;
      if ((control as HTMLInputElement).type === 'checkbox') (control as HTMLInputElement).checked = value as boolean;
      else control.value = String(value);
    }
  };
  const refresh = (event?: Event) => {
    if (settled) return;
    const currentRevision = ++revision;
    valid = false; ok.disabled = true;
    const changed = spec.fields.find(field => controls.get(field.key) === event?.target);
    if (changed && spec.onChange) {
      const patch = spec.onChange(changed.key, Object.freeze(readValues()));
      if (settled || currentRevision !== revision) return;
      applyPatch(patch);
    }
    const values: [string, string | number | boolean][] = []; let message = '';
    for (const field of spec.fields) {
      const control = controls.get(field.key)!; let value: string | number | boolean = control.value;
      if (field.type === 'checkbox') value = (control as HTMLInputElement).checked;
      if (field.type === 'number') value = (control as HTMLInputElement).valueAsNumber;
      const invalid = !control.validity.valid || (field.type === 'number' && !Number.isFinite(value)) ||
        (field.type === 'select' && !allowed.get(field.key)!.has(String(value)));
      control.setAttribute('aria-invalid', String(invalid));
      if (invalid && !message) message = `${field.label}: ${control.validationMessage || 'Enter a valid value.'}`;
      values.push([field.key, value]);
    }
    if (pending) return;
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
  const extend = async (field: Extract<Field, { type: 'select' }>, importing: boolean) => {
    if (settled || (importing && pending)) return;
    pending++; valid = false; ok.disabled = true; [...imports, ...actions].forEach(button => { button.disabled = true; });
    notice.hidden = false; notice.textContent = importing ? 'Loading…' : 'Loading choices…';
    try {
      const result = importing ? await field.importChoice!.run() : await field.loadChoices!();
      if (settled) return;
      const choices = result ? ('choices' in result ? result.choices : [result]) : [];
      if (!Array.isArray(choices) || choices.some(c => !c || typeof c.value !== 'string' || typeof c.label !== 'string')) throw new Error('The imported choice is invalid.');
      const control = controls.get(field.key)!;
      for (const choice of choices) {
        if (allowed.get(field.key)!.has(choice.value)) continue;
        const option = document.createElement('option'); option.value = choice.value; option.textContent = choice.label;
        control.append(option); allowed.get(field.key)!.add(choice.value);
      }
      if (importing && choices.length) control.value = choices[0]!.value;
      notice.textContent = result?.notice ?? '';
    } catch (cause) { if (!settled) notice.textContent = cause instanceof Error ? cause.message : 'Could not load this choice.'; }
    finally {
      pending--;
      if (!settled) { [...imports, ...actions].forEach(button => { button.disabled = pending > 0; }); notice.hidden = !notice.textContent; refresh(); }
    }
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
    // Preserve native newlines and dropdown selection without triggering app confirmation.
    else if (event.key === 'Enter' && ['TEXTAREA', 'SELECT'].includes((event.target as Element).tagName) && !(event.ctrlKey || event.metaKey)) event.stopPropagation();
    else if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); event.target === cancel ? dismiss() : [...imports, ...actions].includes(event.target as HTMLButtonElement) ? (event.target as HTMLButtonElement).click() : commit(); }
    else if (event.key === 'Tab') {
      const focusable = [...dialog.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,select,textarea,button')].filter(control => !control.disabled);
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
    for (const field of spec.fields) if (field.type === 'select' && field.loadChoices) void extend(field, false);
    refresh();
    if (!settled) { dialog.showModal(); (controls.values().next().value ?? (valid ? ok : cancel)).focus(); }
  }
  catch (cause) { settled = true; cleanup(); dialog.remove(); if (opener?.isConnected) opener.focus(); throw cause; }
  return { close: dismiss };
}
