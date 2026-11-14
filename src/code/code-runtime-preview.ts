/**
 * PURPOSE    Render script-free local HTML/CSS previews.
 * KIND       SHELL
 * CONTRACT   IN: live root and validated source project. OUT: a sandboxed preview with local CSS.
 *            RAISES: TypeError for an invalid entry. Operational construction errors propagate.
 * GUARANTEES No script, navigation attributes, embedded frames, forms or external asset loads.
 * TUNING     TAGS and ATTRS define the supported static HTML subset.
 * DECISIONS  D1: Inert template sanitization before srcdoc. Alternative: raw sandboxed HTML;
 *            rejected because meta refresh can still navigate. Revisit if full web preview is scoped.
 * LIMITS     No JS DOM scripting, remote assets, CSS imports or active forms; scripts are visibly unavailable.
 * TESTBENCH  src/code/code-runtime.browser.spec.ts -- see dev/CODE-RUNTIME.md
 */
import type { CodeDocument } from './code-document.ts';
const TAGS = new Set('a abbr article aside b blockquote br button caption code col colgroup dd del details div dl dt em figcaption figure footer h1 h2 h3 h4 h5 h6 header hr i img input label li main mark nav ol option p pre s section select small span strong sub summary sup table tbody td textarea th thead time tr u ul style'.split(' '));
const ATTRS = new Set('id class style title role aria-label aria-hidden alt width height colspan rowspan type value placeholder disabled checked selected multiple open'.split(' '));
function css(text: string) { return text.replace(/</g, '\\3c '); }
export function previewCode(root: HTMLElement, value: CodeDocument): void {
  const document = root.ownerDocument, file = value.files.find(file => file.path === value.entry);
  if (!file || !['html', 'css'].includes(file.language)) throw new TypeError('Choose an HTML or CSS entry to preview.');
  const template = document.createElement('template'); template.innerHTML = file.language === 'html' ? file.text : '<h1>CSS preview</h1><p>Your stylesheet is applied to this sample.</p><button>Sample button</button>';
  const base = file.path.slice(0, file.path.lastIndexOf('/') + 1), styles: string[] = file.language === 'css' ? [file.text] : [];
  for (const link of template.content.querySelectorAll('link')) {
    const local = value.files.find(file => file.path === base + link.getAttribute('href') && file.language === 'css');
    if (link.getAttribute('rel')?.toLowerCase() === 'stylesheet' && local) styles.push(local.text);
  }
  for (const element of [...template.content.querySelectorAll('*')]) {
    if (!TAGS.has(element.localName) || element.namespaceURI !== 'http://www.w3.org/1999/xhtml') { element.remove(); continue; }
    if (element.localName === 'style') element.textContent = css(element.textContent ?? '');
    for (const attribute of [...element.attributes]) {
      const raster = element.localName === 'img' && attribute.name === 'src' && /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/\s]+=*$/i.test(attribute.value);
      if (!ATTRS.has(attribute.name) && !raster) element.removeAttribute(attribute.name);
    }
  }
  const note = document.createElement('p'); note.textContent = 'HTML/CSS preview does not run scripts.';
  const frame = document.createElement('iframe'); frame.title = 'HTML/CSS preview'; frame.setAttribute('sandbox', ''); frame.style.cssText = 'width:100%;min-height:320px;border:1px solid gray;background:white;';
  frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none';"><style>${styles.map(css).join('\n')}</style>${template.innerHTML}`;
  root.replaceChildren(note, frame);
}
