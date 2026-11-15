/**
 * PURPOSE    Define the print-page layout of a document.
 * KIND       CORE
 * CONTRACT   IN: validated PageSetup (Letter/A4/Legal, orientation, margin 0.25–2.5 in,
 *            page-number boolean). OUT: immutable DEFAULT_PAGE; pageInches tuple;
 *            pageCss string owning every top/bottom margin box. RAISES: none.
 * GUARANTEES Pure; no input changes. Numbers are off by default. Sizes and content
 *            margins remain exact regardless of optional footer numbering.
 * TUNING     PAGE_SIZES in inches; DEFAULT_PAGE; ten top/bottom print margin boxes.
 * DECISIONS  D1: Empty content in all margin boxes, including corners, suppresses
 *            browser decorations in supporting print engines. Alternative: zero
 *            page margins; rejected because it damages document layout. Revisit if
 *            print engines change margin-box behavior. Browser preference remains
 *            the fallback on engines that do not honor these rules.
 * LIMITS     Caller validates setup; cannot change the browser's print preferences.
 * TESTBENCH  src/document/document-page.test.ts — node --import tsx --test src/document/document-page.test.ts
 */
export type PageSetup = { size: 'letter' | 'a4' | 'legal'; orientation: 'portrait' | 'landscape'; margin: number; numbers: boolean };
const PAGE_SIZES = { letter: [8.5, 11], a4: [8.27, 11.69], legal: [8.5, 14] } as const;
export const DEFAULT_PAGE: PageSetup = Object.freeze({ size: 'letter', orientation: 'portrait', margin: 1, numbers: false });

/** Page width and height in inches for the given setup. */
export const pageInches = (page: PageSetup): [number, number] => { const [w, h] = PAGE_SIZES[page.size]; return page.orientation === 'portrait' ? [w, h] : [h, w]; };
/** Own every top/bottom margin box, including corners used by browser print decorations. */
export function pageCss(page: PageSetup): string {
  const [w, h] = pageInches(page);
  // Empty strings suppress native headers/footers in supporting browsers; content:none does not.
  const boxes = ['bottom-center', 'top-left-corner', 'top-left', 'top-center', 'top-right', 'top-right-corner', 'bottom-left-corner', 'bottom-left', 'bottom-right', 'bottom-right-corner'];
  const margins = boxes.map(box => `@${box} { ${box === 'bottom-center' && page.numbers ? 'content: counter(page); font: 10pt "Times New Roman", serif;' : 'content: "";'} }`).join(' ');
  return `@page { size: ${w}in ${h}in; margin: ${page.margin}in; ${margins} }`;
}
