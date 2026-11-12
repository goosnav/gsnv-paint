/**
 * PURPOSE    Render the Image workspace Colours and Tool Options panel.
 * KIND       SHELL
 * CONTRACT   IN: panel root and onChange callback. update(model) shows primary/secondary colours, the swatch
 *            palette and the active tool's options. Numeric options pair an XP trackbar with a typed number
 *            box (applied on input for the trackbar, on Enter/blur for the box, clamped to range).
 *            OUT: {update,dispose}. Left-click a swatch sets primary, right-click secondary.
 *            RAISES: TypeError for a missing root/callback.
 * GUARANTEES No document edits; every change routes through onChange. Listeners removed on dispose.
 * TUNING     SWATCHES (28 colours) and OPTIONS (per-tool option list with ranges).
 * DECISIONS  D1: Trackbar plus number box for every numeric option (owner direction): drag for feel,
 *            type for exact values. Native colour inputs for exact colour entry.
 * LIMITS     Opaque colour editing; no saved custom palettes or brush presets.
 * TESTBENCH  src/image/image-palette.test.ts -- run with: node --import tsx --test src/image/image-palette.test.ts
 */
import type { RGBA } from './raster-ops.ts';
import type { ImageTool } from './image-tool-input.ts';

export type ToolOptions = { size: number; hardness: number; opacity: number; flow: number; tolerance: number; contiguous: boolean; style: 'outline' | 'fill' | 'both'; gradient: 'linear' | 'radial'; gradientEnd: 'secondary' | 'transparent'; density: number };
export const DEFAULT_OPTIONS: ToolOptions = { size: 8, hardness: 80, opacity: 100, flow: 100, tolerance: 32, contiguous: true, style: 'outline', gradient: 'linear', gradientEnd: 'secondary', density: 40 };
export type PaletteModel = { primary: RGBA; secondary: RGBA; tool: ImageTool; options: ToolOptions; info: string; enabled: boolean };
export type PaletteChange = { kind: 'primary' | 'secondary'; color: RGBA } | { kind: 'swap' } | { kind: 'option'; key: keyof ToolOptions; value: ToolOptions[keyof ToolOptions] };
type NumberKey = 'size' | 'hardness' | 'opacity' | 'flow' | 'tolerance' | 'density';
const RANGES: Record<NumberKey, { label: string; min: number; max: number; unit: string }> = {
  size: { label: 'Size', min: 1, max: 500, unit: 'px' }, hardness: { label: 'Hardness', min: 0, max: 100, unit: '%' }, opacity: { label: 'Opacity', min: 1, max: 100, unit: '%' },
  flow: { label: 'Flow', min: 1, max: 100, unit: '%' }, tolerance: { label: 'Tolerance', min: 0, max: 255, unit: '' }, density: { label: 'Density', min: 1, max: 200, unit: '' },
};
type Choice = { key: 'style' | 'gradient' | 'gradientEnd'; label: string; choices: [string, string][] };
const STYLE: Choice = { key: 'style', label: 'Shapes', choices: [['outline', 'Outline'], ['fill', 'Fill'], ['both', 'Outline and fill']] };
export const OPTIONS: Record<ImageTool, readonly (NumberKey | Choice | 'contiguous')[]> = {
  move: [], select: [], ellipseSelect: [], lasso: [], wand: ['tolerance', 'contiguous'], picker: [], text: [],
  pencil: ['size'], brush: ['size', 'hardness', 'opacity', 'flow'], airbrush: ['size', 'density', 'opacity'], eraser: ['size', 'hardness', 'opacity'],
  clone: ['size', 'hardness', 'opacity'], blur: ['size', 'hardness', 'opacity'], fill: ['tolerance', 'contiguous', 'opacity'],
  gradient: [{ key: 'gradient', label: 'Shape', choices: [['linear', 'Linear'], ['radial', 'Radial']] }, { key: 'gradientEnd', label: 'Ends at', choices: [['secondary', 'Secondary colour'], ['transparent', 'Transparent']] }, 'opacity'],
  line: ['size'], rectangle: ['size', STYLE], ellipse: ['size', STYLE],
};
export const SWATCHES: readonly string[] = [
  '#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080', '#808040', '#004040', '#0080ff', '#004080', '#8000ff', '#804000',
  '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffff80', '#00ff80', '#80ffff', '#8080ff', '#ff0080', '#ff8040',
];
export const hex = (c: RGBA) => `#${[c[0], c[1], c[2]].map(v => v.toString(16).padStart(2, '0')).join('')}`;
export const parseHex = (value: string): RGBA => {
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new RangeError('Colours are #rrggbb.');
  return [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16), 255];
};

export function imagePalette({ root, onChange }: { root: HTMLElement; onChange: (change: PaletteChange) => void }) {
  if (!root?.ownerDocument || typeof onChange !== 'function') throw new TypeError('The palette needs a root and change callback.');
  const document = root.ownerDocument;
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => { const n = document.createElement(tag); if (className) n.className = className; if (text) n.textContent = text; return n; };
  root.className = 'image-palette'; root.replaceChildren();
  const current = make('div', 'image-current'), primary = make('input', 'image-primary'), secondary = make('input', 'image-secondary'), swap = make('button', 'xp-button image-swap', '⇄');
  for (const [input, label] of [[primary, 'Primary colour'], [secondary, 'Secondary colour']] as const) { input.type = 'color'; input.setAttribute('aria-label', label); input.title = label; }
  swap.type = 'button'; swap.title = 'Swap colours (X)'; swap.setAttribute('aria-label', swap.title);
  current.append(primary, secondary, swap);
  const grid = make('div', 'image-swatches'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Colour palette. Click for primary, right-click for secondary.');
  for (const value of SWATCHES) { const b = make('button', 'image-swatch'); b.type = 'button'; b.dataset.color = value; b.style.background = value; b.title = `${value} — click: primary, right-click: secondary`; b.setAttribute('aria-label', value); grid.append(b); }
  const heading = make('h3', '', 'Tool options'), options = make('div', 'image-options'), info = make('p', 'image-info'); info.setAttribute('aria-live', 'polite');
  root.append(current, grid, heading, options, info);
  let shown = '', model: PaletteModel | null = null;

  function build(tool: ImageTool) {
    options.replaceChildren(); shown = tool;
    if (!OPTIONS[tool].length) options.append(make('p', 'image-none', 'This tool has no options.'));
    for (const option of OPTIONS[tool]) {
      const row = make('div', 'image-option');
      if (option === 'contiguous') { const label = make('label', 'image-check'), box = make('input'); box.type = 'checkbox'; box.dataset.option = 'contiguous'; label.append(box, document.createTextNode(' Contiguous')); row.append(label); }
      else if (typeof option === 'object') {
        const label = make('label', '', option.label), select = make('select', 'xp-field'); select.dataset.option = option.key; select.id = `image-option-${option.key}`; label.htmlFor = select.id;
        for (const [value, text] of option.choices) { const o = make('option', '', text); o.value = value; select.append(o); } row.append(label, select);
      } else {
        const r = RANGES[option], label = make('label', '', r.label), range = make('input', 'xp-range'), number = make('input', 'xp-field');
        range.type = 'range'; number.type = 'number'; for (const n of [range, number]) { n.min = String(r.min); n.max = String(r.max); n.step = '1'; n.dataset.option = option; }
        range.id = `image-option-${option}`; label.htmlFor = range.id; number.setAttribute('aria-label', `${r.label}${r.unit ? ` (${r.unit})` : ''}`); row.append(label, range, number);
      }
      options.append(row);
    }
  }
  const click = (event: MouseEvent) => {
    const target = event.target as HTMLElement, swatch = target.closest<HTMLElement>('[data-color]');
    if (swatch) onChange({ kind: event.type === 'contextmenu' ? 'secondary' : 'primary', color: parseHex(swatch.dataset.color!) });
    else if (target === swap && event.type === 'click') onChange({ kind: 'swap' });
    else return;
    event.preventDefault();
  };
  const input = (event: Event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (target === primary || target === secondary) { onChange({ kind: target === primary ? 'primary' : 'secondary', color: parseHex(target.value) }); return; }
    const key = target.dataset.option as keyof ToolOptions | undefined; if (!key) return;
    if (target.tagName === 'SELECT') { if (event.type === 'change') onChange({ kind: 'option', key, value: target.value as never }); return; }
    if (target.type === 'checkbox') { if (event.type === 'change') onChange({ kind: 'option', key, value: target.checked }); return; }
    if (target.type === 'number' && event.type === 'input') return; // Typed numbers apply on Enter or blur.
    const r = RANGES[key as NumberKey], value = Math.round(Number(target.value));
    if (!Number.isFinite(value) || target.value === '') { render(); return; }
    onChange({ kind: 'option', key, value: Math.min(r.max, Math.max(r.min, value)) });
  };
  root.addEventListener('click', click); root.addEventListener('contextmenu', click); root.addEventListener('input', input); root.addEventListener('change', input);
  function render() {
    if (!model) return;
    if (model.tool !== shown) build(model.tool);
    primary.value = hex(model.primary); secondary.value = hex(model.secondary);
    for (const control of options.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-option]')) {
      const value = model.options[control.dataset.option as keyof ToolOptions];
      if (control.type === 'checkbox') (control as HTMLInputElement).checked = !!value;
      else if (document.activeElement !== control) control.value = String(value);
    }
    for (const control of root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button,input,select')) control.disabled = !model.enabled;
    info.textContent = model.info;
  }
  return {
    update(next: PaletteModel) { model = next; render(); },
    dispose() { root.removeEventListener('click', click); root.removeEventListener('contextmenu', click); root.removeEventListener('input', input); root.removeEventListener('change', input); root.replaceChildren(); },
  };
}
