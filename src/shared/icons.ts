/**
 * PURPOSE    Render local interface artwork inside accessible SVG elements.
 * KIND       SHELL
 * CONTRACT   IN: IconRequest; document, catalog name, text label, size 12–64 CSS px, optional Paint theme.
 *            OUT: SVGSVGElement, accessible label; local paths or embedded native-size Paint PNG.
 *            RAISES: RangeError for unknown glyph or nonfinite/out-of-range size.
 * GUARANTEES No fetched imagery, Microsoft assets, markup injection or shared DOM nodes.
 * TUNING     Paint bitmaps: native 24px tools / 16px commands, nearest-neighbour.
 *            Other glyphs retain Tabler 2-unit or original 1.5-unit SVG strokes.
 * DECISIONS  D1: Paint uses original Windows XP-style pixel artwork with a shared
 *            palette: 24px tools and 16px commands, each drawn on its native grid.
 *            Alternative: mixed illustrated sets; rejected for inconsistent style.
 *            Editable sources, mapping and licenses live in vendor/paint-icons;
 *            other workspaces retain existing vector artwork from vendor/tabler.
 *            Existing workspace-specific original paths remain local.
 *            D2: Use aria-label plus a text title, avoiding generated title IDs and their
 *            collision risk. Alternative: aria-labelledby; Revisit if: a proven AT gap emerges.
 * LIMITS     Labels/tooltips and active/disabled styling are supplied by the chrome.
 * TESTBENCH  src/shared/icons.test.ts -- run with: node --import tsx --test src/shared/icons.test.ts
 */

import { tablerPaths } from './tabler-paths.ts';
import { paintBitmaps, paintBitmapSizes } from './paint-bitmaps.ts';

export type IconRequest = { document: Document; name: string; label: string; size: number; theme?: 'paint' };
export const iconCatalog: readonly string[] = Object.freeze([
  'app', 'cad', 'image', 'photo', 'video', 'document', 'slides', 'audio', 'spreadsheet', 'code', 'play', 'pause', 'split', 'bold', 'italic', 'underline', 'listBullet', 'listNumber', 'alignLeft', 'alignCenter', 'alignRight', 'alignJustify', 'indent', 'outdent', 'link', 'strike', 'table', 'pageBreak', 'pdf', 'new', 'open', 'save', 'undo', 'redo', 'cut', 'copy', 'paste',
  'delete', 'select', 'hand', 'zoomIn', 'zoomOut', 'fit', 'history', 'properties', 'layers',
  'grid', 'ruler', 'line', 'rectangle', 'extrude', 'revolve',
  'pencil', 'brush', 'eraser', 'fill', 'picker', 'ellipse', 'text', 'crop', 'rotate', 'flip',
  'paintTransform', 'paintMove', 'paintSelect', 'paintLasso', 'paintWand', 'paintPencil', 'paintBrush', 'paintAirbrush', 'paintEraser', 'paintSmudge', 'paintRectangle', 'paintEllipse', 'paintEllipseSelect', 'paintClone', 'paintBlur', 'paintFill', 'paintGradient', 'paintPicker', 'paintText', 'paintLine',
  'move', 'ellipseSelect', 'lasso', 'wand', 'airbrush', 'clone', 'blur', 'gradient', 'layerAdd', 'smudge', 'export', 'close', 'help', 'chevronRight', 'chevronDown',
]);

const PATHS: Readonly<Record<string, string>> = {
  spreadsheet: 'M3 3h18v18H3zM3 8h18M3 13h18M3 18h18M8 3v18M14 8v13',
  code: 'M3 4h18v16H3zM6 9l4 3-4 3M12 16h6',
  app: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM17.5 13l4.5 4.5-4.5 4.5-4.5-4.5z',
  cad: 'M12 2.5 21 7.5v10L12 22l-9-4.5v-10zM3 7.5l9 5 9-5M12 12.5V22M7.5 5l9 5',
  image: 'M3 4h18v16H3zM3 16l5-6 5 6 3-3 5 5M15 8a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0',
  photo: 'M2.5 7h4l2-3h7l2 3h4v13h-19zM8 13.5a4 4 0 1 0 8 0 4 4 0 1 0-8 0M18 9.5h1',
  document: 'M5 2h10l4 4v16H5zM15 2v4h4M8 10h8M8 13h8M8 16h8M8 19h5',
  slides: 'M2 4h20v13H2zM12 17v4M8 21h8M5 7h8M5 10h6M15 8h4v6h-4z',
  audio: 'M2 12h2M5 8v8M8 4v16M11 9v6M14 6v12M17 10v4M20 8v8M22 12h0',
  play: 'M7 4l13 8-13 8z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  split: 'M12 2v20M5 7h4l-2 3M19 17h-4l2-3',
  bold: 'M7 4h7a4 4 0 0 1 0 8H7zM7 12h8a4 4 0 0 1 0 8H7z',
  italic: 'M10 4h8M6 20h8M14 4l-4 16',
  underline: 'M7 3v8a5 5 0 0 0 10 0V3M5 21h14',
  listBullet: 'M9 6h12M9 12h12M9 18h12M4 6h1M4 12h1M4 18h1',
  listNumber: 'M10 6h11M10 12h11M10 18h11M4 4h1v4M3 8h3M3 12h3l-3 4h3',
  alignLeft: 'M3 5h18M3 9h12M3 13h18M3 17h12',
  alignCenter: 'M3 5h18M6 9h12M3 13h18M6 17h12',
  alignRight: 'M3 5h18M9 9h12M3 13h18M9 17h12',
  alignJustify: 'M3 5h18M3 9h18M3 13h18M3 17h18',
  indent: 'M3 4h18M11 9h10M11 14h10M3 19h18M3 8l4 3.5L3 15z',
  outdent: 'M3 4h18M11 9h10M11 14h10M3 19h18M7 8l-4 3.5L7 15z',
  link: 'M10 14a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-4 4a4 4 0 0 0 6 6l1-1',
  strike: 'M3 12h18M16 6a4 3 0 0 0-4-2c-3 0-4 2-4 3M8 18a4 3 0 0 0 4 2c3 0 4-2 4-4',
  table: 'M3 4h18v16H3zM3 9h18M3 14h18M9 4v16M15 4v16',
  pageBreak: 'M5 2v6h14V2M5 22v-6h14v6M2 12h3M7 12h3M14 12h3M19 12h3',
  pdf: 'M5 2h10l4 4v16H5zM15 2v4h4M8 13h2a1.5 1.5 0 0 1 0 3H8v-5M13 11v5h1a2 2 0 0 0 0-5zM17 11h2M17 11v5M17 13h2',
  video: 'M3 4h18v16H3zM7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4M10 9l5 3-5 3z',
  extrude: 'M3 12l9-5 9 5v7l-9 4-9-4zM3 12l9 5 9-5M12 17v6M12 13V1M8 5l4-4 4 4',
  revolve: 'M12 2v20M12 5h6v11h-6M8 7C1 8 1 17 8 18M5 14l3 4-5 1M9 3l3-1 3 1',
};
const STROKE_WIDTH = 1.5;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export function renderIcon({ document, name, label, size, theme }: IconRequest): SVGSVGElement {
  if (!iconCatalog.includes(name)) throw new RangeError(`Unknown glyph: ${name}.`);
  if (!Number.isFinite(size) || size < 12 || size > 64) throw new RangeError('Glyph size must be between 12 and 64 CSS pixels.');
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  const bitmap = (name.startsWith('paint') || theme === 'paint') && Object.hasOwn(paintBitmaps, name) ? paintBitmaps[name] : undefined;
  if (bitmap) {
    const nativeSize = paintBitmapSizes[name]!;
    for (const [key, value] of Object.entries({ viewBox: `0 0 ${nativeSize} ${nativeSize}`, width: String(size), height: String(size),
      role: 'img', 'aria-label': label, focusable: 'false', 'data-icon': name, 'data-icon-style': 'paint-bitmap' })) svg.setAttribute(key, value);
    const title = document.createElementNS(SVG_NAMESPACE, 'title'); title.textContent = label;
    const image = document.createElementNS(SVG_NAMESPACE, 'image');
    for (const [key, value] of Object.entries({ href: bitmap, width: String(nativeSize), height: String(nativeSize),
      style: 'image-rendering:crisp-edges;image-rendering:pixelated' })) image.setAttribute(key, value);
    svg.append(title, image); return svg;
  }
  const tabler = Object.hasOwn(tablerPaths, name);
  const attributes = { viewBox: '0 0 24 24', width: String(size), height: String(size), role: 'img',
    'aria-label': label, focusable: 'false', fill: 'none', stroke: 'currentColor',
    'stroke-width': String(tabler ? 2 : STROKE_WIDTH), 'stroke-linecap': tabler ? 'round' : 'square',
    'stroke-linejoin': tabler ? 'round' : 'miter', 'shape-rendering': 'auto', 'data-icon': name };
  for (const [key, value] of Object.entries(attributes)) svg.setAttribute(key, value);
  const title = document.createElementNS(SVG_NAMESPACE, 'title');
  title.textContent = label;
  const path = document.createElementNS(SVG_NAMESPACE, 'path');
  path.setAttribute('d', (tabler ? tablerPaths : PATHS)[name]!);
  svg.append(title, path);
  return svg;
}
