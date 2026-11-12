/**
 * PURPOSE    Render original local interface glyphs as accessible SVG elements.
 * KIND       SHELL
 * CONTRACT   IN: IconRequest; document, catalog name, text label, size 12–64 CSS px.
 *            OUT: SVGSVGElement with 24-unit viewBox, accessible label and local paths.
 *            RAISES: RangeError for unknown glyph or nonfinite/out-of-range size.
 * GUARANTEES No fetched imagery, Microsoft assets, markup injection or shared DOM nodes.
 * TUNING     PATHS is the original glyph catalog; STROKE_WIDTH controls optical weight. Glyphs render
 *            with crisp (aliased) edges for the XP pixel look; colour per glyph comes from chrome.css.
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
  'app', 'cad', 'image', 'photo', 'video', 'new', 'open', 'save', 'undo', 'redo', 'cut', 'copy', 'paste',
  'delete', 'select', 'hand', 'zoomIn', 'zoomOut', 'fit', 'history', 'properties', 'layers',
  'grid', 'ruler', 'line', 'rectangle', 'extrude',
  'pencil', 'brush', 'eraser', 'fill', 'picker', 'ellipse', 'text', 'crop', 'rotate', 'flip',
  'move', 'ellipseSelect', 'lasso', 'wand', 'airbrush', 'clone', 'blur', 'gradient', 'layerAdd', 'export', 'close', 'help', 'chevronRight', 'chevronDown',
]);

const PATHS: Readonly<Record<string, string>> = {
  app: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM17.5 13l4.5 4.5-4.5 4.5-4.5-4.5z',
  cad: 'M12 2.5 21 7.5v10L12 22l-9-4.5v-10zM3 7.5l9 5 9-5M12 12.5V22M7.5 5l9 5',
  image: 'M3 4h18v16H3zM3 16l5-6 5 6 3-3 5 5M15 8a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0',
  photo: 'M2.5 7h4l2-3h7l2 3h4v13h-19zM8 13.5a4 4 0 1 0 8 0 4 4 0 1 0-8 0M18 9.5h1',
  video: 'M3 4h18v16H3zM7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4M10 9l5 3-5 3z',
  new: 'M5 2.5h10l5 5V21H5zM15 2.5v5h5M9 14h7M12.5 10.5v7',
  open: 'M2.5 8V5h7l3 3H21v3M2.5 8v12H20l3-9H7l-4.5 9',
  save: 'M4 3h14l3 3v15H3V3zM7 3v6h9V3M7 21v-8h10v8M10 16h4',
  export: 'M5 3h8l4 4v5M13 3v5h4M5 3v18h12v-3M11 15h11M18 11l4 4-4 4',
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
  line: 'M4 20 20 4M2 18h4v4H2zM18 2h4v4h-4z',
  rectangle: 'M4 5h16v14H4zM2 3h4v4H2zM18 17h4v4h-4z',
  pencil: 'M4 20l1-5L16 4l4 4L9 19zM14 6l4 4M4 20l5-1',
  brush: 'M20 3c-3 2-7 6-9 9l2 2c3-2 7-6 9-9zM11 12c-3 0-5 2-5 4 0 2-1 3-3 4 4 1 9 0 10-4z',
  eraser: 'M3 16 13 6l7 7-7 7H8zM8 11l7 7M8 20h13',
  fill: 'M4 11 11 4l8 8-7 7zM4 11h15M11 4 8 1M20 16s2 3 2 4a2 2 0 0 1-4 0c0-1 2-4 2-4',
  picker: 'M14 4l6 6M17 3a2.5 2.5 0 0 1 4 4l-3 3-4-4zM14 6 5 15l-1 5 5-1 9-9',
  ellipse: 'M2.5 12a9.5 6.5 0 1 0 19 0 9.5 6.5 0 1 0-19 0',
  text: 'M4 5V3h16v2M12 3v18M8 21h8',
  crop: 'M6 2v16h16M2 6h16v16',
  rotate: 'M4 12a8 8 0 1 0 3-6.2M4 3v4h4',
  flip: 'M12 2v20M9 6 3 18h6zM15 6l6 12h-6z',
  move: 'M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3',
  ellipseSelect: 'M12 4h3M19 6l1 2M21 12v1M19 17l-2 2M13 20h-3M6 19l-2-2M3 12v-1M5 7l2-2',
  lasso: 'M6 15c-3-2-3-7 2-9s11-1 12 3-4 7-9 7c-2 0-3 1-3 3s2 3 2 3M6 15c1 1 3 1 3-1',
  wand: 'M3 21 15 9M15 9l2 2M17 3v3M20 5h-3M21 9h-3M13 4l2 2',
  airbrush: 'M4 20l7-7M11 13l3 3 6-6-3-3zM17 4h1M20 6h1M15 2h1M21 2h1',
  clone: 'M8 3h8v6H8zM12 9v4M6 13h12v3H6zM8 16v5h8v-5',
  blur: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11M9 15h2M10 18h4',
  gradient: 'M3 3h18v18H3zM7 3v18M11 3v18M15 3v18',
  layerAdd: 'M12 3 22 8l-10 5L2 8zM2 13l10 5 4-2M19 15v6M16 18h6',
  extrude: 'M3 12l9-5 9 5v7l-9 4-9-4zM3 12l9 5 9-5M12 17v6M12 13V1M8 5l4-4 4 4',
  close: 'M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5',
  help: 'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0M9 8a3 3 0 0 1 6 0c0 3-3 2-3 5M12 17h0',
  chevronRight: 'M8 4l8 8-8 8',
  chevronDown: 'M4 8l8 8 8-8',
};
const STROKE_WIDTH = 1.5;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export function renderIcon({ document, name, label, size }: IconRequest): SVGSVGElement {
  if (!Object.hasOwn(PATHS, name)) throw new RangeError(`Unknown glyph: ${name}.`);
  if (!Number.isFinite(size) || size < 12 || size > 64) throw new RangeError('Glyph size must be between 12 and 64 CSS pixels.');
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  const attributes = { viewBox: '0 0 24 24', width: String(size), height: String(size), role: 'img',
    'aria-label': label, focusable: 'false', fill: 'none', stroke: 'currentColor',
    'stroke-width': String(STROKE_WIDTH), 'stroke-linecap': 'square', 'stroke-linejoin': 'miter', 'shape-rendering': 'crispEdges', 'data-icon': name };
  for (const [key, value] of Object.entries(attributes)) svg.setAttribute(key, value);
  const title = document.createElementNS(SVG_NAMESPACE, 'title');
  title.textContent = label;
  const path = document.createElementNS(SVG_NAMESPACE, 'path');
  path.setAttribute('d', PATHS[name]!);
  svg.append(title, path);
  return svg;
}
