/**
 * PURPOSE    Hold a basic word-processor document: rich text as sanitized HTML plus page setup.
 * KIND       CORE
 * CONTRACT   documentContent({operation}) with 'new' | 'edit' {value, html?, page?, parse} | 'encode' | 'decode' {content, parse}.
 *            `parse` is an HTML parser port (DOMParser in browsers, jsdom in tests) returning a Document.
 *            sanitizeHtml keeps only an allowlist of block/inline tags, safe attributes, a few style
 *            properties and data:image sources, so stored or opened files can never run script.
 *            OUT: frozen DocumentContent, or {content Json, assets: []}. Helpers: wordCount(text), sanitizeHtml(html, parse).
 *            RAISES: DocumentEditError for invalid page setup; DocumentContentError for malformed files.
 * GUARANTEES Pure apart from the parser port; sanitizing is idempotent.
 * TUNING     ALLOWED_TAGS, STYLE_PROPERTIES, MAX_HTML below.
 * DECISIONS  D1: Store HTML (images inline as data: URLs) rather than a custom node tree: the browser's
 *            editing engine produces it and print-to-PDF renders it. Alternative: a ProseMirror-style schema;
 *            rejected as a large dependency for a basic editor. Revisit if: collaborative editing or DOCX export.
 * LIMITS     No tracked changes, footnotes or columns; one section with one page setup.
 * TESTBENCH  src/document/document-content.test.ts -- run with: node --import tsx --test src/document/document-content.test.ts
 */
import { DEFAULT_PAGE, type PageSetup } from './document-page.ts';
export type DocumentContent = { readonly html: string; readonly page: Readonly<PageSetup> };
export type Parse = (html: string) => Document;

const ALLOWED_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'LI', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SUB', 'SUP', 'BR', 'HR', 'SPAN', 'FONT', 'DIV', 'A', 'IMG', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'CODE']);
const DROP_WITH_CONTENT = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'MATH', 'TITLE', 'META', 'LINK', 'HEAD']);
const STYLE_PROPERTIES = new Set(['text-align', 'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'margin-left', 'width', 'line-height', 'break-after']);
const MAX_HTML = 64 * 1024 * 1024;
const editFail = (message: string): never => { throw Object.assign(new Error(message), { name: 'DocumentEditError' }); };
const fileFail = (message: string): never => { throw Object.assign(new Error(message), { name: 'DocumentContentError' }); };

export const wordCount = (text: string) => (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

function safeStyle(style: string): string {
  const out: string[] = [];
  for (const declaration of style.split(';')) {
    const at = declaration.indexOf(':'); if (at < 0) continue;
    const property = declaration.slice(0, at).trim().toLowerCase(), value = declaration.slice(at + 1).trim();
    if (!STYLE_PROPERTIES.has(property) || !value || value.length > 120 || /url\s*\(|expression\s*\(|[<>\\]|javascript:/i.test(value)) continue;
    out.push(`${property}: ${value}`);
  }
  return out.join('; ');
}
const safeImage = (src: string) => /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(src);
const safeLink = (href: string) => /^(https?:|mailto:)/i.test(href.trim());

/** Keep only allowlisted markup. Unknown elements are unwrapped (their text stays); dangerous ones are removed. */
export function sanitizeHtml(html: string, parse: Parse): string {
  if (typeof html !== 'string') return '';
  const doc = parse(`<!doctype html><body>${html}`), body = doc.body;
  const clean = (node: Node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) continue;
      if (child.nodeType !== 1) { child.remove(); continue; }
      const el = child as HTMLElement, tag = el.tagName.toUpperCase();
      if (DROP_WITH_CONTENT.has(tag)) { el.remove(); continue; }
      clean(el);
      if (!ALLOWED_TAGS.has(tag)) { el.replaceWith(...el.childNodes); continue; }
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase(), value = attr.value;
        const keep = name === 'style' ? (el.setAttribute('style', safeStyle(value)), !!el.getAttribute('style')) :
          tag === 'IMG' && name === 'src' ? safeImage(value) : tag === 'IMG' && (name === 'alt' || name === 'width') ? value.length < 300 :
          tag === 'A' && name === 'href' ? safeLink(value) : tag === 'FONT' && (name === 'face' || name === 'color' || name === 'size') ? /^[\w\s,#"'-]{1,80}$/.test(value) :
          (tag === 'TD' || tag === 'TH') && (name === 'colspan' || name === 'rowspan') ? /^\d{1,2}$/.test(value) : false;
        if (!keep) el.removeAttribute(attr.name);
      }
      if (tag === 'IMG' && !el.getAttribute('src')) el.remove();
      if (tag === 'A' && !el.getAttribute('href')) { el.replaceWith(...el.childNodes); continue; }
      if (tag === 'A') { el.setAttribute('rel', 'noopener noreferrer'); el.setAttribute('target', '_blank'); }
    }
  };
  clean(body);
  return body.innerHTML;
}

function checkPage(page: PageSetup, fail: (m: string) => never) {
  if (!page || typeof page !== 'object' || Object.keys(page).sort().join() !== 'margin,numbers,orientation,size' || !['letter', 'a4', 'legal'].includes(page.size) || !['portrait', 'landscape'].includes(page.orientation) || typeof page.numbers !== 'boolean' || !Number.isFinite(page.margin) || page.margin < 0.25 || page.margin > 2.5) fail('Page setup needs Letter, A4 or Legal, an orientation and margins of 0.25–2.5 in.');
}

type Request = { operation: 'new'; html?: string } | { operation: 'edit'; value: DocumentContent; html?: string; page?: PageSetup; parse: Parse }
  | { operation: 'encode'; value: DocumentContent } | { operation: 'decode'; content: unknown; parse: Parse };
type Encoded = { content: { html: string; page: PageSetup }; assets: never[] };
function applyDocument(request: Request): DocumentContent | Encoded {
  const freeze = (html: string, page: PageSetup): DocumentContent => Object.freeze({ html, page: Object.freeze({ ...page }) });
  if (request.operation === 'new') return freeze(request.html ?? '<p><br></p>', DEFAULT_PAGE);
  if (request.operation === 'encode') return { content: { html: request.value.html, page: { ...request.value.page } }, assets: [] };
  if (request.operation === 'decode') {
    const c = request.content as Encoded['content'];
    if (!c || typeof c !== 'object' || Object.keys(c).sort().join() !== 'html,page' || typeof c.html !== 'string' || c.html.length > MAX_HTML) fileFail('This document uses an unsupported layout.');
    checkPage(c.page, fileFail);
    return freeze(sanitizeHtml(c.html, request.parse) || '<p><br></p>', c.page);
  }
  const page = request.page ?? request.value.page; checkPage(page, editFail);
  const html = request.html === undefined ? request.value.html : sanitizeHtml(request.html, request.parse);
  if (html.length > MAX_HTML) editFail('The document is too large (64 MB limit).');
  return freeze(html || '<p><br></p>', page);
}

type Output<T extends Request> = T extends { operation: 'encode' } ? Encoded : DocumentContent;
export function documentContent<T extends Request>(request: T): Output<T> { return applyDocument(request) as Output<T>; }
