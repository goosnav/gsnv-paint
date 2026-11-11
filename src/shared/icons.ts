/**
 * PURPOSE    Render original local interface glyphs as accessible SVG elements.
 * KIND       SHELL
 * CONTRACT   IN: IconRequest; document, catalog name, text label, size 12–64 CSS px.
 *            OUT: SVGSVGElement with 24-unit viewBox, accessible label and local paths.
 *            RAISES: RangeError for unknown glyph or nonfinite/out-of-range size.
 * GUARANTEES No fetched imagery, Microsoft assets, markup injection or shared DOM nodes.
 * TUNING     PATHS is the original glyph catalog; STROKE_WIDTH controls optical weight.
 * DECISIONS  D1: Draw app-specific paths rather than ship a stock icon package, keeping
 *            the visual vocabulary original and locally available. Revisit if: the
 *            owner changes the original-assets requirement.
 *            D2: Use aria-label plus a text title, avoiding generated title IDs and their
 *            collision risk. Alternative: aria-labelledby; Revisit if: a proven AT gap emerges.
 * LIMITS     Labels/tooltips and active/disabled styling are supplied by the chrome.
 * TESTBENCH  src/shared/icons.test.ts -- run with: node --import tsx --test src/shared/icons.test.ts
 */

export type IconRequest = { document: Document; name: string; label: string; size: number };
export const iconCatalog: readonly string[] = Object.freeze([
  'app', 'cad', 'image', 'video', 'new', 'open', 'save', 'undo', 'redo', 'cut', 'copy', 'paste',
  'delete', 'select', 'hand', 'zoomIn', 'zoomOut', 'fit', 'history', 'properties', 'layers',
  'grid', 'ruler', 'close', 'help', 'chevronRight', 'chevronDown',
]);

const PATHS: Readonly<Record<string, string>> = {
  app: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM17.5 13l4.5 4.5-4.5 4.5-4.5-4.5z',
  cad: 'M12 2.5 21 7.5v10L12 22l-9-4.5v-10zM3 7.5l9 5 9-5M12 12.5V22M7.5 5l9 5',
  image: 'M3 4h18v16H3zM3 16l5-6 5 6 3-3 5 5M15 8a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0',
  video: 'M3 4h18v16H3zM7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4M10 9l5 3-5 3z',
  new: 'M5 2.5h10l5 5V21H5zM15 2.5v5h5M9 14h7M12.5 10.5v7',
  open: 'M2.5 8V5h7l3 3H21v3M2.5 8v12H20l3-9H7l-4.5 9',
  save: 'M4 3h14l3 3v15H3V3zM7 3v6h9V3M7 21v-8h10v8M10 16h4',
  undo: 'M8 4 3 9l5 5M3 9h10a7 7 0 0 1 7 7v4',
  redo: 'M16 4l5 5-5 5M21 9h-10a7 7 0 0 0-7 7v4',
  cut: 'M4 14a3 3 0 1 0 0 6 3 3 0 1 0 0-6M17 14a3 3 0 1 0 0 6 3 3 0 1 0 0-6M6 15 18 3M15 15 3 3',
  copy: 'M8 7h12v15H8zM16 7V2H3v15h5M11 11h6M11 15h6',
  paste: 'M8 5H4v17h16V5h-4M8 3h8v5H8zM8 12h8M8 16h6',
  delete: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
  select: 'M5 2.5v18l4.5-5 4 6 3-2-4-6 7-1z',
  hand: 'M8 12V5a1.5 1.5 0 0 1 3 0v6-8a1.5 1.5 0 0 1 3 0v8-6a1.5 1.5 0 0 1 3 0v7-3a1.5 1.5 0 0 1 3 0v6l-3 7H9L3 14a1.5 1.5 0 0 1 2-2l3 3',
  zoomIn: 'M3 10a7 7 0 1 0 14 0 7 7 0 1 0-14 0M15 15l6 6M6 10h8M10 6v8',
  zoomOut: 'M3 10a7 7 0 1 0 14 0 7 7 0 1 0-14 0M15 15l6 6M6 10h8',
  fit: 'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6M7 7h10v10H7z',
  history: 'M3 5v6h6M3 11a9 9 0 1 1 2 7M12 7v6l4 2',
  properties: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',
  layers: 'M12 3 22 8l-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5',
  grid: 'M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18',
  ruler: 'M2 16 16 2l6 6L8 22zM6 12l3 3M10 8l2 2M14 4l3 3M4 14l2 2',
  close: 'M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5',
  help: 'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0M9 8a3 3 0 0 1 6 0c0 3-3 2-3 5M12 17h0',
  chevronRight: 'M8 4l8 8-8 8',
  chevronDown: 'M4 8l8 8 8-8',
};
const STROKE_WIDTH = 1.7;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export function renderIcon({ document, name, label, size }: IconRequest): SVGSVGElement {
  if (!Object.hasOwn(PATHS, name)) throw new RangeError(`Unknown glyph: ${name}.`);
  if (!Number.isFinite(size) || size < 12 || size > 64) throw new RangeError('Glyph size must be between 12 and 64 CSS pixels.');
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  const attributes = { viewBox: '0 0 24 24', width: String(size), height: String(size), role: 'img',
    'aria-label': label, focusable: 'false', fill: 'none', stroke: 'currentColor',
    'stroke-width': String(STROKE_WIDTH), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  for (const [key, value] of Object.entries(attributes)) svg.setAttribute(key, value);
  const title = document.createElementNS(SVG_NAMESPACE, 'title');
  title.textContent = label;
  const path = document.createElementNS(SVG_NAMESPACE, 'path');
  path.setAttribute('d', PATHS[name]!);
  svg.append(title, path);
  return svg;
}
