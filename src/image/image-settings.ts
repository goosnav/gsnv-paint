/**
 * PURPOSE    Describe transactional image settings dialogs.
 * KIND       SHELL
 * CONTRACT   imageNewDialog accepts DOM/foreground/Create callback; returns typed fields
 *            named presets, orientation swap and a bounded miniature, initially
 *            white US Letter at 300 ppi (2550×3300), Pixel art/full colour.
 *            imagePolicyDialog accepts immutable policy/raster plus preview/commit/cancel
 *            callbacks; returns Rendering, colour-limit, dither, source and custom-swatch fields.
 *            Validated values are JSON; callbacks receive owned frozen PixelPolicy values.
 *            Invalid input returns readable errors without preview or document mutation.
 *            RAISES: TypeError for missing ports, invalid foreground or source raster.
 * GUARANTEES No pixel mutation, image-sized allocation, persistence or implicit creation.
 * TUNING     MAX_PIXELS limits dimensions; supported palette counts match PALETTE CORE.
 * DECISIONS  D1: Explicit palette source preserves existing custom swatches. Alternative:
 *            regenerate on every edit; rejected because artwork colours would drift.
 *            Revisit if: the product introduces separate live/adaptive palettes.
 *            D2: Borrow immutable source raster and cache each requested generated count.
 *            Alternative: generate for every keystroke; rejected for repeated full-image cost.
 *            Revisit if: generation becomes asynchronous through shared dialog support.
 * LIMITS     Caller owns actual image preview/rollback and safe New replacement. Miniature
 *            shows blank canvas proportions/background, not a full raster renderer.
 * TESTBENCH  node --import tsx --test src/image/image-settings.test.ts
 * DEMO       npm run dev -- --host 127.0.0.1; open /src/image/image-settings.demo.html.
 */
import type { DialogSpec } from '../shared/dialog.ts';
import { MAX_PIXELS, MAX_DIMENSION, isRasterSize, type Raster, type RGBA } from './raster-ops.ts';
import { pixelPolicy, type PixelPolicy, type RGB } from './image-pixel-policy.ts';
import { generatePalette, presetPalette } from './image-palette-core.ts';
import { NEW_IMAGE_PRESETS, matchingNewImagePreset, newImagePresetValues } from './image-new-presets.ts';

export type NewImageSettings = { width: number; height: number; fill: RGBA; policy: PixelPolicy };
type Values = DialogSpec['initial'];
type Json = Parameters<DialogSpec['preview']>[0];
const COUNTS = [2, 4, 8, 16, 32, 64, 128, 256];
const MODES = [{ value: 'pixel-art', label: 'Pixel art — hard edges' }, { value: 'smooth', label: 'Smooth artwork — antialiased edges' }];
const DITHERS = [{ value: 'none', label: 'None' }, { value: 'bayer', label: 'Ordered (Bayer 4×4)' }, { value: 'floyd-steinberg', label: 'Floyd–Steinberg' }];
const failure = (message: string) => ({ ok: false as const, error: { code: 'image.settings', message } });
const serial = (policy: PixelPolicy): Json => ({ mode: policy.mode, palette: policy.palette ? { colours: policy.palette.colours.map(colour => [...colour]), dither: policy.palette.dither } : null });
const hex = (colour: RGB) => '#' + colour.map(byte => byte.toString(16).padStart(2, '0')).join('');
function fields(extraCount = 0): DialogSpec['fields'] {
  const counts = COUNTS.includes(extraCount) || !extraCount ? COUNTS : [...COUNTS, extraCount].sort((a, b) => a - b);
  return [
    { key: 'mode', label: 'Rendering', type: 'select', choices: MODES },
    { key: 'colours', label: 'Colour limit', type: 'select', choices: [{ value: 'full', label: 'Full colour' }, ...counts.map(count => ({ value: String(count), label: `${count} colours${COUNTS.includes(count) ? '' : ' (current)'}` }))] },
    { key: 'dither', label: 'Dithering', type: 'select', choices: DITHERS },
  ];
}
function options(values: Values, extraCount = 0): { mode: PixelPolicy['mode']; count: number; dither: NonNullable<PixelPolicy['palette']>['dither'] } {
  if (!MODES.some(mode => mode.value === values.mode)) throw new Error('Choose Pixel art or Smooth artwork rendering.');
  if (!DITHERS.some(dither => dither.value === values.dither)) throw new Error('Choose a supported dithering method.');
  if (typeof values.colours !== 'string' || (values.colours !== 'full' && ![...COUNTS, ...(extraCount ? [extraCount] : [])].some(count => String(count) === values.colours))) throw new Error('Choose full colour or one of the listed colour limits.');
  return { mode: values.mode as PixelPolicy['mode'], count: values.colours === 'full' ? 0 : Number(values.colours), dither: values.dither as NonNullable<PixelPolicy['palette']>['dither'] };
}
function previewBox(document: Document): { root: HTMLElement; content: HTMLElement; caption: HTMLElement } {
  if (!document || typeof document.createElement !== 'function') throw new TypeError('A document is required for settings previews.');
  const root = document.createElement('figure'), content = document.createElement('div'), caption = document.createElement('figcaption');
  root.style.margin = '0 0 10px'; caption.style.marginTop = '4px'; caption.style.overflowWrap = 'anywhere';
  root.append(content, caption); return { root, content, caption };
}

export function imageNewDialog({ document, colour, onCreate }: { document: Document; colour: RGBA; onCreate(value: NewImageSettings): void }): DialogSpec & { previewElement: HTMLElement } {
  if (!Array.isArray(colour) || colour.length !== 4 || !colour.every(channel => Number.isInteger(channel) && channel >= 0 && channel <= 255) || typeof onCreate !== 'function') throw new TypeError('New image needs a foreground RGBA colour and a Create callback.');
  const foreground: RGBA = [colour[0], colour[1], colour[2], colour[3]], miniature = previewBox(document), canvas = document.createElement('div');
  miniature.root.setAttribute('aria-label', 'New canvas preview');
  Object.assign(miniature.content.style, { height: '108px', display: 'grid', placeItems: 'center', background: 'var(--xp-workspace)', border: '1px solid var(--xp-shadow)' });
  Object.assign(canvas.style, { border: '1px solid var(--xp-dark)', background: 'repeating-conic-gradient(#fff 0 25%,#ddd 0 50%) 0 0 / 8px 8px' });
  const fill = document.createElement('div'); fill.style.width = '100%'; fill.style.height = '100%'; canvas.append(fill); miniature.content.append(canvas);
  return { title: 'New image', confirmLabel: 'Create', description: 'Choose a preset, then adjust the size and style. Pixel art keeps hard edges; Smooth keeps antialiasing. Colour limits and dithering affect the final image.', previewElement: miniature.root,
    fields: [{ key: 'preset', label: 'Preset', type: 'select', layout: 'stacked', choices: [...NEW_IMAGE_PRESETS.map(preset => ({ value: preset.id, label: preset.label })), { value: 'custom', label: 'Custom settings' }] },
      { key: 'width', label: 'Width (px)', type: 'number', min: 1, max: MAX_DIMENSION, step: 1 },
      { key: 'height', label: 'Height (px)', type: 'number', min: 1, max: MAX_DIMENSION, step: 1, action: { label: 'Swap width and height', update(values) {
        if (typeof values.width !== 'number' || typeof values.height !== 'number' || !Number.isFinite(values.width) || !Number.isFinite(values.height)) return {};
        const swapped = { ...values, width: values.height!, height: values.width! };
        return { width: swapped.width, height: swapped.height, preset: matchingNewImagePreset(swapped)?.id ?? 'custom' };
      } } },
      { key: 'background', label: 'Background', type: 'select', choices: [{ value: 'white', label: 'White' }, { value: 'transparent', label: 'Transparent' }, { value: 'foreground', label: 'Foreground colour' }] }, ...fields()],
    initial: newImagePresetValues(NEW_IMAGE_PRESETS[0]!),
    onChange(key, values) {
      if (key === 'preset') {
        const preset = NEW_IMAGE_PRESETS.find(preset => preset.id === values.preset);
        return preset ? newImagePresetValues(preset) : {};
      }
      return { preset: matchingNewImagePreset(values)?.id ?? 'custom' };
    },
    validate(values) {
      const { width, height } = values;
      if (values.preset !== 'custom' && !NEW_IMAGE_PRESETS.some(preset => preset.id === values.preset)) return failure('Choose a listed preset or Custom settings.');
      if (typeof width !== 'number' || typeof height !== 'number' || !isRasterSize(width, height)) return failure(`Use whole-pixel dimensions of at least 1; at most ${MAX_DIMENSION.toLocaleString()} per side and ${MAX_PIXELS.toLocaleString()} pixels in total.`);
      if (!['white', 'transparent', 'foreground'].includes(String(values.background))) return failure('Choose a canvas background.');
      try {
        const { mode, count, dither } = options(values), background = values.background === 'white' ? [255, 255, 255, 255] : values.background === 'transparent' ? [0, 0, 0, 0] : [...foreground];
        const policy = pixelPolicy({ mode, palette: count ? { colours: presetPalette(count), dither } : null });
        return { ok: true, value: { width, height, fill: background, policy: serial(policy) } };
      } catch (cause) { return failure(cause instanceof Error ? cause.message : 'Invalid image settings.'); }
    },
    preview(value) {
      const settings = value as unknown as NewImageSettings, scale = Math.min(180 / settings.width, 88 / settings.height);
      canvas.style.width = `${Math.max(1, settings.width * scale)}px`; canvas.style.height = `${Math.max(1, settings.height * scale)}px`;
      fill.style.background = `rgba(${settings.fill[0]},${settings.fill[1]},${settings.fill[2]},${settings.fill[3] / 255})`;
      const preset = matchingNewImagePreset({ width: settings.width, height: settings.height, background: settings.fill[3] === 0 ? 'transparent' : settings.fill.every(channel => channel === 255) ? 'white' : 'foreground', mode: settings.policy.mode, colours: settings.policy.palette ? String(settings.policy.palette.colours.length) : 'full', dither: settings.policy.palette?.dither ?? 'none' });
      const details = preset?.ppi ? `Print sizing: ${(settings.width / preset.ppi).toFixed(2).replace(/\.?0+$/, '')} × ${(settings.height / preset.ppi).toFixed(2).replace(/\.?0+$/, '')} in at ${preset.ppi} ppi.` : preset?.id === 'square-max' ? 'Maximum square within the canvas pixel limit.' : '';
      miniature.caption.textContent = `${settings.width} × ${settings.height} px · ${settings.policy.mode === 'pixel-art' ? 'Pixel art' : 'Smooth artwork'} · ${settings.policy.palette ? `${settings.policy.palette.colours.length} colours + transparency` : 'Full colour'}${details ? `\n${details}` : ''}`;
      miniature.caption.style.whiteSpace = 'pre-line';
    },
    commit(value) { const settings = value as unknown as NewImageSettings; onCreate({ width: settings.width, height: settings.height, fill: [...settings.fill], policy: pixelPolicy(settings.policy) }); }, cancel() {},
  };
}

export function imagePolicyDialog({ document, policy, raster, onPreview, onCommit, onCancel }: {
  document: Document; policy: PixelPolicy; raster: Raster; onPreview(value: PixelPolicy): void; onCommit(value: PixelPolicy): void; onCancel(): void;
}): DialogSpec & { previewElement: HTMLElement } {
  const original = pixelPolicy(policy), count = original.palette?.colours.length ?? 0;
  if (![onPreview, onCommit, onCancel].every(callback => typeof callback === 'function') || !raster || !isRasterSize(raster.width, raster.height) || !(raster.data instanceof Uint8ClampedArray) || raster.data.length !== raster.width * raster.height * 4) throw new TypeError('Pixel settings need a valid immutable raster and preview/commit/cancel callbacks.');
  const miniature = previewBox(document), generated = new Map<number, readonly RGB[]>();
  miniature.root.setAttribute('aria-label', 'Palette preview');
  Object.assign(miniature.content.style, { display: 'grid', gridTemplateColumns: 'repeat(16,minmax(0,1fr))', gap: '1px', maxHeight: '100px', overflow: 'auto' });
  const describe = (value: PixelPolicy) => {
    miniature.content.replaceChildren();
    for (const colour of value.palette?.colours ?? []) {
      const swatch = document.createElement('span'); swatch.title = hex(colour); swatch.style.background = hex(colour); swatch.style.height = '14px'; swatch.style.border = '1px solid var(--xp-shadow)'; miniature.content.append(swatch);
    }
    miniature.caption.textContent = value.palette ? `${value.palette.colours.length} fixed colours + transparency. Dithering: ${DITHERS.find(option => option.value === value.palette!.dither)!.label}.` : 'Full colour. Palette and dithering controls apply only with a colour limit.';
  };
  return { title: 'Pixel settings', description: 'Rendering controls new edges and resampling; existing pixels stay unchanged. A fixed palette limits the visible/exported result. Choose Custom swatches to edit the hex colours below. Generate samples the current image once for each selected limit.', previewElement: miniature.root,
    fields: [...fields(count), { key: 'source', label: 'Palette source', type: 'select', choices: [{ value: 'preset', label: 'Preset colours' }, { value: 'generate', label: 'Generate from current image' }, { value: 'custom', label: 'Custom swatches' }] },
      { key: 'swatches', label: 'Custom swatches (hex)', type: 'text', multiline: true, placeholder: '#000000 #ffffff — one colour per space or line' }],
    initial: { mode: original.mode, colours: count ? String(count) : 'full', dither: original.palette?.dither ?? 'none', source: count ? 'custom' : 'preset', swatches: (original.palette?.colours ?? presetPalette(16)).map(hex).join(' ') },
    validate(values) {
      try {
        const { mode, count: desired, dither } = options(values, count);
        if (!['preset', 'generate', 'custom'].includes(String(values.source))) throw new Error('Choose a palette source.');
        if (!desired) return { ok: true, value: serial(pixelPolicy({ mode, palette: null })) };
        let colours: readonly RGB[];
        if (values.source === 'custom') {
          if (typeof values.swatches !== 'string') throw new Error('Enter custom swatches as six-digit hex colours.');
          const words = values.swatches.trim().split(/[\s,]+/).filter(Boolean);
          if (words.length !== desired) throw new Error(`Enter exactly ${desired} custom colour swatches, separated by spaces or new lines.`);
          if (words.some(word => !/^#?[\da-f]{6}$/i.test(word))) throw new Error('Each swatch needs six hex digits, for example #ff8800.');
          colours = words.map(word => { const raw = word.replace(/^#/, ''); return [0, 2, 4].map(offset => Number.parseInt(raw.slice(offset, offset + 2), 16)) as unknown as RGB; });
        } else {
          if (!COUNTS.includes(desired)) throw new Error('Choose a listed standard colour limit for Preset or Generate, or keep Custom swatches.');
          if (values.source === 'generate' && !generated.has(desired)) generated.set(desired, generatePalette(raster, desired));
          colours = values.source === 'generate' ? generated.get(desired)! : presetPalette(desired);
        }
        return { ok: true, value: serial(pixelPolicy({ mode, palette: { colours, dither } })) };
      } catch (cause) { return failure(cause instanceof Error ? cause.message : 'Invalid pixel settings.'); }
    },
    preview(value) { const next = pixelPolicy(value); describe(next); onPreview(next); },
    commit(value) { onCommit(pixelPolicy(value)); }, cancel: onCancel,
  };
}
