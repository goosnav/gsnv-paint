/**
 * PURPOSE    Render the Image workspace colour and tool-option panel.
 * KIND       SHELL
 * CONTRACT   IN: panel root and onChange callback. update(model) shows primary/secondary colours,
 *            the swatch palette, tool size, shape style and a read-only information line.
 *            OUT: {update,dispose}. Left-click a swatch sets primary, right-click sets secondary;
 *            the colour inputs edit either colour; size and style controls report exact values.
 *            RAISES: TypeError for a missing root/callback.
 * GUARANTEES No document edits; every change routes through onChange. Listeners removed on dispose.
 * TUNING     SWATCHES is the default 28-colour palette; SIZES are the quick size choices.
 * DECISIONS  D1: Native colour inputs rather than a custom picker: accessible and exact.
 *            Revisit if: alpha editing is required (native inputs are opaque only).
 * LIMITS     Opaque colour editing; no saved custom palettes.
 * TESTBENCH  src/image/image-palette.test.ts -- run with: node --import tsx --test src/image/image-palette.test.ts
 */
import type { RGBA } from './raster-ops.ts';

export type ShapeStyle = 'outline' | 'fill' | 'both';
export type PaletteModel = { primary: RGBA; secondary: RGBA; size: number; style: ShapeStyle; info: string; enabled: boolean };
export type PaletteChange = { kind: 'primary' | 'secondary'; color: RGBA } | { kind: 'size'; size: number } | { kind: 'style'; style: ShapeStyle } | { kind: 'swap' };
export const SWATCHES: readonly string[] = [
  '#000000', '#7f7f7f', '#880015', '#ed1c24', '#ff7f27', '#fff200', '#22b14c', '#00a2e8', '#3f48cc', '#a349a4', '#5b3a1e', '#1f5f5b', '#2d2d6b', '#6b1f4f',
  '#ffffff', '#c3c3c3', '#b97a57', '#ffaec9', '#ffc90e', '#efe4b0', '#b5e61d', '#99d9ea', '#7092be', '#c8bfe7', '#e8d3b0', '#a8e6cf', '#d0d8ff', '#f4c2e0',
];
const SIZES = [1, 2, 3, 5, 8, 12, 20];

export const hex = (c: RGBA) => `#${[c[0], c[1], c[2]].map(v => v.toString(16).padStart(2, '0')).join('')}`;
export const parseHex = (value: string): RGBA => {
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new RangeError('Colours are #rrggbb.');
  return [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16), 255];
};

export function imagePalette({ root, onChange }: { root: HTMLElement; onChange: (change: PaletteChange) => void }) {
  if (!root?.ownerDocument || typeof onChange !== 'function') throw new TypeError('The palette needs a root and change callback.');
  const document = root.ownerDocument;
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };
  root.className = 'image-palette'; root.replaceChildren();
  const current = make('div', 'image-current'), primary = make('input', 'image-primary'), secondary = make('input', 'image-secondary'), swap = make('button', 'image-swap', '⇄');
  for (const [input, label] of [[primary, 'Primary colour'], [secondary, 'Secondary colour']] as const) { input.type = 'color'; input.setAttribute('aria-label', label); input.title = label; }
  swap.type = 'button'; swap.title = 'Swap colours (X)'; swap.setAttribute('aria-label', swap.title);
  current.append(primary, secondary, swap);
  const grid = make('div', 'image-swatches'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Colour palette. Click for primary, right-click for secondary.');
  for (const value of SWATCHES) { const b = make('button', 'image-swatch'); b.type = 'button'; b.dataset.color = value; b.style.background = value; b.title = `${value} — click: primary, right-click: secondary`; b.setAttribute('aria-label', value); grid.append(b); }
  const sizeHeading = make('h3', '', 'Size'), sizes = make('div', 'image-sizes'); sizes.setAttribute('role', 'radiogroup'); sizes.setAttribute('aria-label', 'Tool size');
  for (const size of SIZES) { const b = make('button', 'image-size'); b.type = 'button'; b.dataset.size = String(size); b.setAttribute('role', 'radio'); b.setAttribute('aria-label', `${size} px`); b.title = `${size} px`; const dot = make('span'); dot.style.width = dot.style.height = `${Math.min(size, 16)}px`; b.append(dot); sizes.append(b); }
  const sizeInput = make('input', 'image-size-input'); sizeInput.type = 'number'; sizeInput.min = '1'; sizeInput.max = '512'; sizeInput.step = '1'; sizeInput.setAttribute('aria-label', 'Tool size in pixels');
  const styleLabel = make('label', 'image-style-label', 'Shapes '), style = make('select', 'image-style');
  for (const [value, label] of [['outline', 'Outline'], ['fill', 'Fill'], ['both', 'Outline and fill']]) { const o = make('option', '', label); o.value = value!; style.append(o); }
  styleLabel.append(style);
  const info = make('p', 'image-info'); info.setAttribute('aria-live', 'polite');
  root.append(current, grid, sizeHeading, sizes, sizeInput, styleLabel, info);

  const click = (event: MouseEvent) => {
    const target = event.target as HTMLElement, swatch = target.closest<HTMLElement>('[data-color]'), size = target.closest<HTMLElement>('[data-size]');
    if (swatch) onChange({ kind: event.type === 'contextmenu' ? 'secondary' : 'primary', color: parseHex(swatch.dataset.color!) });
    else if (size && event.type === 'click') onChange({ kind: 'size', size: Number(size.dataset.size) });
    else if (target === swap && event.type === 'click') onChange({ kind: 'swap' });
    else return;
    event.preventDefault();
  };
  const input = (event: Event) => {
    const target = event.target;
    if (target === primary || target === secondary) onChange({ kind: target === primary ? 'primary' : 'secondary', color: parseHex((target as HTMLInputElement).value) });
    else if (target === sizeInput) { const value = Number(sizeInput.value); if (Number.isInteger(value) && value >= 1 && value <= 512) onChange({ kind: 'size', size: value }); }
    else if (target === style) onChange({ kind: 'style', style: style.value as ShapeStyle });
  };
  root.addEventListener('click', click); root.addEventListener('contextmenu', click); root.addEventListener('input', input); root.addEventListener('change', input);
  return {
    update(model: PaletteModel) {
      primary.value = hex(model.primary); secondary.value = hex(model.secondary);
      for (const control of root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button,input,select')) control.disabled = !model.enabled;
      for (const b of sizes.children) (b as HTMLElement).setAttribute('aria-checked', String(Number((b as HTMLElement).dataset.size) === model.size));
      if (document.activeElement !== sizeInput) sizeInput.value = String(model.size);
      style.value = model.style; info.textContent = model.info;
    },
    dispose() { root.removeEventListener('click', click); root.removeEventListener('contextmenu', click); root.removeEventListener('input', input); root.removeEventListener('change', input); root.replaceChildren(); },
  };
}
