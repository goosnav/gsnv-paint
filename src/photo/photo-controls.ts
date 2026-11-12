/**
 * PURPOSE    Render the Photo Develop inspector: histogram, Auto/profile/presets and slider sections.
 * KIND       SHELL
 * CONTRACT   IN: root and callbacks. update({settings,histogram,enabled,cropMode,before,aspect}) reflects state.
 *            OUT: {update,dispose}. Slider drags call onPreview(change); release/keyboard commit calls
 *            onCommit(change,label); double-clicking a slider's label resets it; buttons call onAction(id).
 *            RAISES: TypeError for a missing root or callbacks.
 * GUARANTEES No document edits; values come from SLIDERS ranges; listeners removed on dispose.
 * TUNING     SECTIONS orders the panel; slider tracks for Temp/Tint show their colour direction.
 * DECISIONS  D1: Native range inputs for accessibility and keyboard control, styled to the theme.
 * LIMITS     Parametric curve only (no draggable point curve).
 * TESTBENCH  src/photo/photo-controls.test.ts -- run with: node --import tsx --test src/photo/photo-controls.test.ts
 */
import { SLIDERS, BANDS, PRESETS, type DevelopSettings } from './develop-settings.ts';

type Scalar = keyof typeof SLIDERS;
export type ControlsState = { settings: DevelopSettings; histogram: Uint32Array | null; enabled: boolean; cropMode: boolean; before: boolean; aspect: string };
type Callbacks = { onPreview(change: Partial<DevelopSettings>): void; onCommit(change: Partial<DevelopSettings>, label: string): void; onAction(id: string): void };
const SECTIONS: readonly [string, readonly Scalar[]][] = [
  ['Light', ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks']],
  ['Colour', ['temperature', 'tint', 'vibrance', 'saturation']],
  ['Presence', ['texture', 'clarity', 'dehaze']],
  ['Tone curve', ['curveHighlights', 'curveLights', 'curveDarks', 'curveShadows']],
  ['Detail', ['sharpenAmount', 'sharpenRadius', 'sharpenMasking', 'noiseLuminance', 'noiseColor']],
  ['Effects', ['vignette', 'vignetteMidpoint', 'grain']],
];
export const ASPECTS: Record<string, number | null> = { Free: null, Original: 0, '1 : 1': 1, '4 : 5': 4 / 5, '3 : 2': 3 / 2, '16 : 9': 16 / 9 };
const BAND_COLOURS = ['#e5484d', '#f08c3a', '#e8c547', '#4cc26e', '#3fc1c9', '#4f7cff', '#9a63e8', '#d958b5'];
const format = (key: Scalar, v: number) => key === 'exposure' ? `${v > 0 ? '+' : ''}${v.toFixed(2)}` : key === 'sharpenRadius' ? v.toFixed(1) : key === 'straighten' ? `${v.toFixed(1)}°` : `${v > 0 && SLIDERS[key].min < 0 ? '+' : ''}${Math.round(v)}`;

export function photoControls({ root, onPreview, onCommit, onAction }: { root: HTMLElement } & Callbacks) {
  if (!root?.ownerDocument || ![onPreview, onCommit, onAction].every(f => typeof f === 'function')) throw new TypeError('Photo controls need a root and callbacks.');
  const document = root.ownerDocument;
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => { const n = document.createElement(tag); if (className) n.className = className; if (text) n.textContent = text; return n; };
  root.className = 'photo-controls'; root.replaceChildren();
  let state: ControlsState | null = null, mixerMode: 'hue' | 'sat' | 'lum' = 'hue';
  const histogram = make('canvas', 'photo-histogram'); histogram.width = 540; histogram.height = 160; histogram.setAttribute('aria-label', 'Histogram');
  const button = (id: string, label: string, className = 'photo-button') => { const b = make('button', className, label); b.type = 'button'; b.dataset.action = id; return b; };
  const top = make('div', 'photo-top'), profile = make('div', 'photo-segmented');
  profile.setAttribute('role', 'radiogroup'); profile.setAttribute('aria-label', 'Profile');
  for (const [value, label] of [['color', 'Colour'], ['mono', 'B&W']] as const) { const b = button(`profile.${value}`, label, 'photo-segment'); b.setAttribute('role', 'radio'); profile.append(b); }
  top.append(button('photo.auto', 'Auto', 'photo-button photo-primary'), profile, button('photo.reset', 'Reset'));
  const presets = make('div', 'photo-presets');
  for (const name of Object.keys(PRESETS)) presets.append(button(`preset.${name}`, name, 'photo-chip'));
  const sliders = new Map<Scalar, { input: HTMLInputElement; value: HTMLOutputElement }>();
  const slider = (key: Scalar) => {
    const range = SLIDERS[key], row = make('div', 'photo-slider'), head = make('div', 'photo-slider-head'), label = make('label', '', range.label), value = make('output');
    const input = make('input'); input.type = 'range'; input.min = String(range.min); input.max = String(range.max); input.step = String(range.step); input.dataset.key = key;
    input.id = `photo-${key}`; label.htmlFor = input.id; label.title = 'Double-click to reset'; label.dataset.reset = key;
    if (key === 'temperature' || key === 'tint') input.dataset.track = key;
    head.append(label, value); row.append(head, input); sliders.set(key, { input, value }); return row;
  };
  const sections: HTMLElement[] = [];
  for (const [title, keys] of SECTIONS) {
    const details = make('details', 'photo-section'); details.open = ['Light', 'Colour', 'Presence'].includes(title);
    details.append(make('summary', '', title)); for (const key of keys) details.append(slider(key));
    if (title === 'Tone curve') { const curve = make('canvas', 'photo-curve'); curve.width = 540; curve.height = 200; curve.setAttribute('aria-label', 'Tone curve'); details.insertBefore(curve, details.children[1]!); }
    sections.push(details);
  }
  const mixer = make('details', 'photo-section'), tabs = make('div', 'photo-segmented'), bands = make('div', 'photo-bands');
  mixer.append(make('summary', '', 'Colour mixer'), tabs, bands);
  for (const [mode, label] of [['hue', 'Hue'], ['sat', 'Saturation'], ['lum', 'Luminance']] as const) { const b = button(`mixer.${mode}`, label, 'photo-segment'); tabs.append(b); }
  const bandInputs = BANDS.map((band, i) => {
    const row = make('div', 'photo-slider'), head = make('div', 'photo-slider-head'), label = make('label', '', band[0]!.toUpperCase() + band.slice(1)), value = make('output'), input = make('input');
    input.type = 'range'; input.min = '-100'; input.max = '100'; input.step = '1'; input.id = `photo-band-${band}`; label.htmlFor = input.id; label.dataset.band = String(i); input.dataset.band = String(i);
    input.style.setProperty('--band', BAND_COLOURS[i]!); head.append(label, value); row.append(head, input); bands.append(row); return { input, value };
  });
  sections.splice(4, 0, mixer);
  const geometry = make('details', 'photo-section'), aspect = make('select', 'photo-aspect'), geometryRow = make('div', 'photo-row');
  for (const name of Object.keys(ASPECTS)) { const o = make('option', '', name); o.value = name; aspect.append(o); }
  aspect.setAttribute('aria-label', 'Crop aspect ratio');
  geometryRow.append(button('photo.crop', 'Crop', 'photo-button'), aspect, button('photo.rotateLeft', '⟲', 'photo-icon'), button('photo.rotateRight', '⟳', 'photo-icon'), button('photo.flip', '⇋', 'photo-icon'));
  for (const b of geometryRow.querySelectorAll('.photo-icon')) b.setAttribute('aria-label', { 'photo.rotateLeft': 'Rotate left', 'photo.rotateRight': 'Rotate right', 'photo.flip': 'Flip horizontal' }[(b as HTMLElement).dataset.action!]!);
  geometry.open = true; geometry.append(make('summary', '', 'Crop & geometry'), geometryRow, slider('straighten'), button('photo.resetCrop', 'Reset crop'));
  sections.unshift(geometry);
  root.append(histogram, top, presets, ...sections);

  const mixerChange = (input: HTMLInputElement) => { const values = [...state!.settings[mixerMode]] as DevelopSettings['hue']; values[Number(input.dataset.band)] = Number(input.value); return { [mixerMode]: values } as Partial<DevelopSettings>; };
  const input = (event: Event) => {
    const target = event.target as HTMLInputElement; if (!state) return;
    if ((target as Element) === aspect) { onAction(`aspect.${aspect.value}`); return; }
    const change = target.dataset.key ? { [target.dataset.key]: Number(target.value) } as Partial<DevelopSettings> : target.dataset.band ? mixerChange(target) : null;
    if (!change) return;
    const label = target.dataset.key ? SLIDERS[target.dataset.key as Scalar].label : `${mixerMode === 'hue' ? 'Hue' : mixerMode === 'sat' ? 'Saturation' : 'Luminance'}: ${BANDS[Number(target.dataset.band)]}`;
    if (event.type === 'input') onPreview(change); else onCommit(change, label);
  };
  const click = (event: Event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]'); if (!target || !state?.enabled) return;
    const id = target.dataset.action!;
    if (id.startsWith('mixer.')) { mixerMode = id.slice(6) as typeof mixerMode; render(); return; }
    if (id.startsWith('profile.')) { onCommit({ profile: id.slice(8) as DevelopSettings['profile'] }, 'Profile'); return; }
    onAction(id);
  };
  const reset = (event: Event) => {
    const target = event.target as HTMLElement; if (!state?.enabled) return;
    if (target.dataset.reset) { const key = target.dataset.reset as Scalar; onCommit({ [key]: SLIDERS[key].fallback } as Partial<DevelopSettings>, `Reset ${SLIDERS[key].label}`); }
    else if (target.dataset.band) { const values = [...state.settings[mixerMode]] as DevelopSettings['hue']; values[Number(target.dataset.band)] = 0; onCommit({ [mixerMode]: values } as Partial<DevelopSettings>, 'Reset colour'); }
  };
  root.addEventListener('input', input); root.addEventListener('change', input); root.addEventListener('click', click); root.addEventListener('dblclick', reset);

  function drawHistogram() {
    const c = histogram.getContext?.('2d'); if (!c) return;
    const { width, height } = histogram; c.clearRect(0, 0, width, height); c.fillStyle = '#121316'; c.fillRect(0, 0, width, height);
    const h = state?.histogram; if (!h) return;
    let peak = 1; for (let i = 0; i < 768; i++) if (i % 256 > 1 && i % 256 < 254) peak = Math.max(peak, h[i]!);
    c.globalCompositeOperation = 'lighter';
    for (const [k, colour] of [[0, '#e5484d'], [1, '#3fbf6a'], [2, '#4f7cff']] as const) {
      c.beginPath(); c.moveTo(0, height);
      for (let i = 0; i < 256; i++) c.lineTo(i / 255 * width, height - Math.min(1, Math.sqrt(h[k * 256 + i]! / peak)) * (height - 6));
      c.lineTo(width, height); c.closePath(); c.fillStyle = colour + 'a0'; c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    const total = h.subarray(768).reduce((s, v) => s + v, 0) || 1;
    if (h[768]! / total > 0.002) { c.fillStyle = '#4f8cff'; c.fillRect(4, 4, 10, 10); }
    if (h[1023]! / total > 0.002) { c.fillStyle = '#ffffff'; c.fillRect(width - 14, 4, 10, 10); }
  }
  function drawCurve() {
    const canvas = root.querySelector<HTMLCanvasElement>('.photo-curve'), c = canvas?.getContext?.('2d'); if (!c || !canvas || !state) return;
    const { width, height } = canvas, s = state.settings, bump = (x: number, m: number) => Math.max(0, 1 - Math.abs(x - m) / 0.25);
    c.fillStyle = '#121316'; c.fillRect(0, 0, width, height); c.strokeStyle = '#2f3137'; c.lineWidth = 1;
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(i * width / 4, 0); c.lineTo(i * width / 4, height); c.moveTo(0, i * height / 4); c.lineTo(width, i * height / 4); c.stroke(); }
    c.strokeStyle = '#e8e9ec'; c.lineWidth = 3; c.beginPath(); let prev = 0;
    for (let i = 0; i <= 100; i++) {
      const x = i / 100, y = Math.max(prev, Math.min(1, x + 0.12 * (s.curveShadows / 100 * bump(x, 0.125) + s.curveDarks / 100 * bump(x, 0.375) + s.curveLights / 100 * bump(x, 0.625) + s.curveHighlights / 100 * bump(x, 0.875)) * Math.sin(Math.PI * x) ** 0.5)); prev = y;
      if (i) c.lineTo(x * width, (1 - y) * height); else c.moveTo(0, height);
    }
    c.stroke();
  }
  function render() {
    if (!state) return; const s = state.settings;
    for (const [key, { input, value }] of sliders) { if (document.activeElement !== input) input.value = String(s[key]); value.textContent = format(key, s[key]); input.style.setProperty('--fill', `${(s[key] - SLIDERS[key].min) / (SLIDERS[key].max - SLIDERS[key].min) * 100}%`); }
    bandInputs.forEach(({ input, value }, i) => { const v = s[mixerMode][i]!; if (document.activeElement !== input) input.value = String(v); value.textContent = `${v > 0 ? '+' : ''}${v}`; input.style.setProperty('--fill', `${(v + 100) / 2}%`); });
    for (const b of tabs.children) b.setAttribute('aria-checked', String((b as HTMLElement).dataset.action === `mixer.${mixerMode}`));
    for (const b of profile.children) b.setAttribute('aria-checked', String((b as HTMLElement).dataset.action === `profile.${s.profile}`));
    root.querySelector('[data-action="photo.crop"]')!.setAttribute('aria-pressed', String(state.cropMode));
    if (document.activeElement !== aspect) aspect.value = state.aspect;
    for (const control of root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button,input,select')) control.disabled = !state.enabled;
    root.dataset.before = String(state.before); drawHistogram(); drawCurve();
  }
  return {
    update(next: ControlsState) { state = next; render(); },
    dispose() { root.removeEventListener('input', input); root.removeEventListener('change', input); root.removeEventListener('click', click); root.removeEventListener('dblclick', reset); root.replaceChildren(); },
  };
}
