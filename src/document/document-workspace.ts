/**
 * PURPOSE    Connect the basic word processor (Word-style formatting, page view, PDF export) to the shared application.
 * KIND       SHELL assembly DOCUMENT-APP; contentEditable editing, browser print for PDF, file ports.
 * CONTRACT   IN: S07 file ports and a browser document. OUT: WorkspaceAdapter for gsnv-document. Content rules and
 *            sanitizing belong to document-content.ts. Typing commits after a short pause (one history entry per
 *            burst), and before undo, save, menus or losing focus; formatting commands commit at once.
 *            RAISES: invalid project content from decode; file failures show in a visible, announced notice.
 * GUARANTEES Pasted and opened HTML is sanitized before it reaches the page; the editor never runs document script.
 * TUNING     TYPING_PAUSE, FONTS, SIZES below.
 * DECISIONS  D1: PDF through the browser's print engine (Save as PDF) with @page CSS: exact text layout, real
 *            selectable text, page numbers, no dependency. Alternative: a JavaScript PDF writer; rejected because it
 *            would re-implement line breaking and fonts. Revisit if: one-click download without the print dialog matters.
 * LIMITS     Uses document.execCommand (still the only cross-browser rich-text command set); page breaks in the
 *            editor are guides, the print engine decides final breaks.
 * TESTBENCH  src/document/document-workspace.browser.spec.ts -- run with: npm run test:browser -- src/document/document-workspace.browser.spec.ts
 */
import type { WorkspaceAdapter } from '../app/app-shell.ts';
import { fileAccess, type FilePorts } from '../shared/file-access.ts';
import { renderIcon } from '../shared/icons.ts';
import { documentContent, pageCss, pageInches, wordCount, sanitizeHtml, type DocumentContent, type PageSetup } from './document-content.ts';
import './document-workspace.css';

type Snapshot = Parameters<ReturnType<WorkspaceAdapter['mount']>['render']>[0];
const TYPING_PAUSE = 600, DPI = 96;
const FONTS = ['Times New Roman', 'Georgia', 'Garamond', 'Arial', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Courier New'];
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];
const STYLES = [['p', 'Normal'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['blockquote', 'Quote'], ['pre', 'Code']] as const;
// Shared by the page view and the printed PDF so both lay out the same way.
export const CONTENT_CSS = `
.doc-body { font: 12pt/1.15 "Times New Roman", Times, serif; color: #000; overflow-wrap: break-word; }
.doc-body p { margin: 0 0 8pt; } .doc-body h1 { font: bold 20pt/1.2 Arial, sans-serif; margin: 12pt 0 6pt; } .doc-body h2 { font: bold 16pt/1.2 Arial, sans-serif; margin: 10pt 0 6pt; }
.doc-body h3 { font: bold 13pt/1.2 Arial, sans-serif; margin: 8pt 0 4pt; } .doc-body blockquote { margin: 0 0 8pt 0.5in; font-style: italic; } .doc-body pre { font: 10pt "Courier New", monospace; white-space: pre-wrap; margin: 0 0 8pt; }
.doc-body ul, .doc-body ol { margin: 0 0 8pt; padding-left: 0.4in; } .doc-body img { max-width: 100%; height: auto; }
.doc-body table { border-collapse: collapse; width: 100%; margin: 0 0 8pt; } .doc-body td, .doc-body th { border: 1px solid #000; padding: 2pt 4pt; vertical-align: top; min-width: 0.4in; }
.doc-body a { color: #0645ad; } .doc-body hr { border: 0; border-top: 1px solid #000; }`;
const PRINT_CSS = `html, body { margin: 0; } .doc-body hr[style*="break-after"] { border: 0; height: 0; margin: 0; break-after: page; } img { break-inside: avoid; }`;
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const textToHtml = (text: string) => text.split(/\r?\n\r?\n/).map(p => `<p>${escapeHtml(p).replace(/\r?\n/g, '<br>') || '<br>'}</p>`).join('');
const base64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const joinParts = (parts: readonly Uint8Array[]) => { const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

export function createDocumentWorkspace(files: FilePorts): WorkspaceAdapter {
  const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
  const blank = (title = 'Untitled document', html?: string) => ({ id: crypto.randomUUID(), title, format: 'gsnv-document', version: 1, value: documentContent({ operation: 'new', ...(html ? { html: sanitizeHtml(html, parse) } : {}) }) });
  return {
    create: () => blank(),
    decode(packageValue) {
      const p = packageValue.project; if (p.format !== 'gsnv-document') throw new Error('This is not a gsnv-document project.');
      return { id: p.id, title: p.title, format: p.format, version: p.version, value: documentContent({ operation: 'decode', content: p.content, parse }) };
    },
    encode(document) { const e = documentContent({ operation: 'encode', value: document.value as DocumentContent }); return { project: { format: 'gsnv-document', version: 1, id: document.id, title: document.title, content: e.content }, assets: e.assets }; },
    mount(host) {
      const doc = host.root.ownerDocument, window = doc.defaultView!;
      const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => { const n = doc.createElement(tag); if (className) n.className = className; if (text) n.textContent = text; return n; };
      const stage = make('div', 'doc-stage'), bar = make('div', 'doc-toolbar'), notice = make('div', 'doc-notice'), scroller = make('div', 'doc-scroller'), sheet = make('div', 'doc-sheet'), editor = make('div', 'doc-body doc-page'), empty = make('div', 'doc-empty'), info = make('div', 'doc-info');
      const style = make('style'); style.textContent = CONTENT_CSS; stage.append(style);
      editor.contentEditable = 'true'; editor.spellcheck = true; editor.addEventListener('focus', () => doc.execCommand('defaultParagraphSeparator', false, 'p')); editor.setAttribute('role', 'textbox'); editor.setAttribute('aria-multiline', 'true'); editor.setAttribute('aria-label', 'Document text');
      editor.setAttribute('aria-description', 'Escape moves to the formatting controls. Tab indents text; Shift+Tab decreases indentation.');
      notice.hidden = true;
      sheet.append(editor); scroller.append(sheet, empty); stage.append(bar, notice, scroller, info); info.setAttribute('aria-live', 'polite'); host.root.append(stage);
      const newButton = make('button', 'xp-button', 'New blank document'); newButton.type = 'button';
      empty.append(make('h2', '', 'Write a document'), make('p', '', 'Type and format text, add pictures, tables and links, then export a PDF.'), newButton);
      // Formatting toolbar (Word 2003 layout): style, font, size | B I U S | colour | align | lists | indent | insert.
      const select = (label: string, options: readonly (readonly [string, string])[], width: number) => { const s = make('select', 'xp-field doc-select'); s.setAttribute('aria-label', label); s.style.width = `${width}px`; for (const [v, t] of options) s.append(Object.assign(make('option'), { value: v, textContent: t })); bar.append(s); return s; };
      const styleSelect = select('Style', STYLES, 96), fontSelect = select('Font', FONTS.map(f => [f, f] as const), 128), sizeSelect = select('Font size', SIZES.map(s => [String(s), String(s)] as const), 48);
      for (const f of fontSelect.options) f.style.fontFamily = f.value;
      const sep = () => bar.append(make('span', 'doc-sep'));
      const tool = (command: string, icon: string, label: string, pressed = false) => { const b = make('button', 'doc-tool'); b.type = 'button'; b.dataset.docCommand = command; b.title = label; b.setAttribute('aria-label', label); if (pressed) b.setAttribute('aria-pressed', 'false'); b.append(renderIcon({ document: doc, name: icon, label, size: 16 })); bar.append(b); return b; };
      sep(); const pressedTools = [tool('doc.bold', 'bold', 'Bold (Ctrl+B)', true), tool('doc.italic', 'italic', 'Italic (Ctrl+I)', true), tool('doc.underline', 'underline', 'Underline (Ctrl+U)', true), tool('doc.strike', 'strike', 'Strikethrough', true)];
      sep(); const colour = make('label', 'doc-colour'), colourInput = Object.assign(make('input'), { type: 'color', value: '#c00000' }); colour.title = 'Font colour'; colour.append(make('span', '', 'A'), colourInput); colourInput.setAttribute('aria-label', 'Font colour'); bar.append(colour);
      const mark = make('label', 'doc-colour doc-mark'), markInput = Object.assign(make('input'), { type: 'color', value: '#ffff00' }); mark.title = 'Highlight'; mark.append(make('span', '', 'ab'), markInput); markInput.setAttribute('aria-label', 'Highlight colour'); bar.append(mark);
      sep(); pressedTools.push(tool('doc.alignLeft', 'alignLeft', 'Align left', true), tool('doc.alignCenter', 'alignCenter', 'Centre', true), tool('doc.alignRight', 'alignRight', 'Align right', true), tool('doc.alignJustify', 'alignJustify', 'Justify', true));
      sep(); pressedTools.push(tool('doc.numbers', 'listNumber', 'Numbering', true), tool('doc.bullets', 'listBullet', 'Bullets', true)); tool('doc.outdent', 'outdent', 'Decrease indent'); tool('doc.indent', 'indent', 'Increase indent');
      sep(); tool('doc.picture', 'image', 'Insert picture…'); tool('doc.table', 'table', 'Insert table…'); tool('doc.link', 'link', 'Insert link…'); tool('doc.pageBreak', 'pageBreak', 'Page break');
      sep(); const zoom = select('Zoom', [['0.75', '75%'], ['1', '100%'], ['1.25', '125%'], ['1.5', '150%']], 64); zoom.value = '1';
      let current: Snapshot, content: DocumentContent | null = null, ownHtml = '', timer = 0, savedRange: Range | null = null, picked: HTMLImageElement | null = null, status = '', disposed = false;

      function layout() {
        if (!content) return; const [w, h] = pageInches(content.page), m = content.page.margin, z = Number(zoom.value);
        editor.style.width = `${w * DPI}px`; editor.style.minHeight = `${h * DPI}px`; editor.style.padding = `${m * DPI}px`;
        editor.style.setProperty('--page-content', `${(h - 2 * m) * DPI}px`); sheet.style.zoom = String(z);
      }
      const describe = () => content ? `Estimated pages ${pages()}   ·   ${wordCount(editor.innerText)} words   ·   ${content.page.size === 'a4' ? 'A4' : content.page.size === 'legal' ? 'Legal' : 'Letter'} ${content.page.orientation}${content.page.numbers ? ', page numbers' : ''}   ·   Esc: formatting controls` : 'Create a new document or open one.';
      function pages() {
        if (!content) return 1;
        const [, h] = pageInches(content.page), body = (h - 2 * content.page.margin) * DPI * Number(zoom.value);
        const breaks = [...editor.querySelectorAll<HTMLElement>('[style]')].filter(e => ['page', 'always'].includes(e.style.breakAfter));
        let previous: HTMLElement | null = null, count = 0;
        // Measure each flow section separately: a forced break discards the unused space on its last page.
        // Range bounds exclude the editor's minimum page height and the visual break guide itself.
        for (const end of [...breaks, null]) {
          const range = doc.createRange();
          if (previous) range.setStartAfter(previous); else range.setStart(editor, 0);
          if (end) { if (end.tagName === 'HR') range.setEndBefore(end); else range.setEndAfter(end); }
          else range.setEnd(editor, editor.childNodes.length);
          const rects = [...range.getClientRects()].filter(r => r.height > 0);
          const height = rects.length ? Math.max(...rects.map(r => r.bottom)) - Math.min(...rects.map(r => r.top)) : 0;
          count += Math.max(1, Math.ceil((height - 1) / body)); previous = end;
        }
        return count;
      }
      function setStatus(message: string, error = false) {
        status = message; notice.textContent = message; notice.hidden = !message;
        notice.setAttribute('role', error ? 'alert' : 'status'); notice.dataset.error = String(error); host.invalidate();
      }
      function flush(label = 'Typing') {
        window.clearTimeout(timer); timer = 0; if (!content || !current) return;
        const next = documentContent({ operation: 'edit', value: content, html: editor.innerHTML, parse });
        if (next.html === content.html) return;
        ownHtml = next.html; host.commit({ ...current, value: next }, label, current.identity);
      }
      const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(() => flush(), TYPING_PAUSE); };
      function saveSelection() { const sel = doc.getSelection(); if (sel && sel.rangeCount && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) savedRange = sel.getRangeAt(0).cloneRange(); }
      function restoreSelection() {
        const sel = doc.getSelection(); if (!sel) return;
        // Leave a live caret alone: re-adding the range would drop Chrome's pending typing style (e.g. bold off).
        if (doc.activeElement === editor && sel.rangeCount && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) return;
        editor.focus({ preventScroll: true });
        if (savedRange && editor.contains(savedRange.commonAncestorContainer)) { sel.removeAllRanges(); sel.addRange(savedRange); }
        else if (!sel.rangeCount || !editor.contains(sel.getRangeAt(0).commonAncestorContainer)) { const r = doc.createRange(); r.selectNodeContents(editor); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
      }
      function exec(command: string, value?: string, label = 'Format') {
        if (!content) return; restoreSelection(); doc.execCommand('styleWithCSS', false, command === 'hiliteColor' ? 'true' : 'false');
        doc.execCommand(command, false, value); if (command.startsWith('insert') && command.endsWith('List')) unnestLists(); saveSelection(); flush(label); syncToolbar();
      }
      // Chrome puts a new list inside the current <p>; lift it out so further editing (and the PDF) see valid blocks.
      function unnestLists() {
        const sel = doc.getSelection(), r = sel?.rangeCount ? sel.getRangeAt(0) : null, keep = r && [r.startContainer, r.startOffset, r.endContainer, r.endOffset] as const;
        for (const list of editor.querySelectorAll('p > ul, p > ol')) { const p = list.parentElement!; p.replaceWith(...[...p.childNodes].filter(n => n.nodeType !== 3 || n.textContent!.trim() || n === keep?.[0])); }
        if (keep && editor.contains(keep[0]) && editor.contains(keep[2])) sel!.setBaseAndExtent(keep[0], keep[1], keep[2], keep[3]);
      }
      function fontSize(points: number) {
        restoreSelection(); doc.execCommand('styleWithCSS', false, 'false'); doc.execCommand('fontSize', false, '7');
        for (const f of editor.querySelectorAll('font[size="7"]')) { const span = make('span'); span.style.fontSize = `${points}pt`; span.append(...f.childNodes); f.replaceWith(span); }
        saveSelection(); flush('Font size'); syncToolbar();
      }
      function syncToolbar() {
        if (!content) return; const sel = doc.getSelection(), inside = !!sel?.rangeCount && editor.contains(sel.getRangeAt(0).commonAncestorContainer);
        const state = (c: string) => { try { return inside && doc.queryCommandState(c); } catch { return false; } };
        const map: Record<string, string> = { 'doc.bold': 'bold', 'doc.italic': 'italic', 'doc.underline': 'underline', 'doc.strike': 'strikeThrough', 'doc.alignLeft': 'justifyLeft', 'doc.alignCenter': 'justifyCenter', 'doc.alignRight': 'justifyRight', 'doc.alignJustify': 'justifyFull', 'doc.numbers': 'insertOrderedList', 'doc.bullets': 'insertUnorderedList' };
        for (const b of pressedTools) b.setAttribute('aria-pressed', String(state(map[b.dataset.docCommand!]!)));
        if (!inside) return;
        const node = sel!.getRangeAt(0).startContainer, el = (node.nodeType === 1 ? node : node.parentElement) as HTMLElement, computed = window.getComputedStyle(el);
        const block = el.closest('h1,h2,h3,blockquote,pre,p,li,div'); styleSelect.value = block && STYLES.some(([t]) => t === block.tagName.toLowerCase()) ? block.tagName.toLowerCase() : 'p';
        const family = computed.fontFamily.split(',')[0]!.replace(/["']/g, '').trim(); fontSelect.value = FONTS.includes(family) ? family : '';
        const pt = Math.round(parseFloat(computed.fontSize) * 0.75 * 2) / 2; sizeSelect.value = SIZES.includes(pt) ? String(pt) : ''; if (!sizeSelect.value) { const o = sizeSelect.querySelector<HTMLOptionElement>('option[data-custom]') ?? sizeSelect.appendChild(Object.assign(make('option'), { hidden: true })); o.dataset.custom = ''; o.value = o.textContent = String(pt); sizeSelect.value = String(pt); }
      }
      async function openFile(accept: Record<string, string[]>): Promise<{ name: string; bytes: Uint8Array } | null> {
        const result = await fileAccess({ op: 'open', accept }, files); if (disposed || 'cancelled' in result) return null;
        if (!result.ok) { setStatus(`${result.error.code}: ${result.error.message}`, true); return null; }
        return { name: result.value.name, bytes: joinParts(result.value.bytes) };
      }
      async function insertPicture() {
        if (!content || !current) return; flush(); const revision = current.identity;
        const file = await openFile({ 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'] }); if (!file) return;
        const ext = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase(), mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
        if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime)) { setStatus('Pictures can be PNG, JPEG, GIF or WebP.', true); return; }
        const image = make('img'); image.src = `data:${mime};base64,${base64(file.bytes)}`;
        try { await image.decode(); if (!image.naturalWidth || !image.naturalHeight) throw new Error('Empty picture'); }
        catch { if (!disposed) setStatus(`Could not read "${file.name}" as a picture. Choose a valid PNG, JPEG, GIF or WebP file.`, true); return; }
        if (disposed) return;
        if (current?.identity !== revision) { setStatus('The document changed before the picture was ready. Insert the picture again.', true); return; }
        exec('insertImage', image.src, 'Insert picture');
      }
      async function importText() {
        const file = await openFile({ 'text/plain': ['.txt', '.md'], 'text/html': ['.html', '.htm'] }); if (!file) return;
        const text = new TextDecoder().decode(file.bytes), html = /\.html?$/i.test(file.name) ? parse(text).body.innerHTML : textToHtml(text);
        await host.open(blank(file.name.replace(/\.[^.]+$/, ''), html));
      }
      function printDocument(): Promise<void> {
        if (!content || !current) return Promise.resolve(); flush();
        const frame = make('iframe', 'doc-print'); frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
        frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(current.title || 'document')}</title><style>${pageCss(content.page)}${CONTENT_CSS}${PRINT_CSS}</style></head><body><div class="doc-body">${content.html}</div></body></html>`;
        return new Promise(resolve => {
          frame.onload = () => { const w = frame.contentWindow!; w.addEventListener('afterprint', () => { frame.remove(); resolve(); }, { once: true }); window.setTimeout(() => { w.focus(); w.print(); }, 50); window.setTimeout(() => { if (frame.isConnected) frame.remove(); resolve(); }, 120000); };
          stage.append(frame);
        });
      }
      async function exportFile(kind: 'html' | 'txt') {
        if (!content || !current) return; flush();
        const name = `${current.title.trim() || 'document'}.${kind}`, text = kind === 'html'
          ? `<!doctype html>\n<html><head><meta charset="utf-8"><title>${escapeHtml(current.title)}</title><style>body{max-width:${pageInches(content.page)[0] - 2 * content.page.margin}in;margin:${content.page.margin}in auto}${CONTENT_CSS}</style></head><body class="doc-body">${content.html}</body></html>\n`
          : editor.innerText.replace(/\n{3,}/g, '\n\n');
        const saved = await fileAccess({ op: 'save', name, mime: kind === 'html' ? 'text/html' : 'text/plain', bytes: new TextEncoder().encode(text) }, files);
        if ('cancelled' in saved || disposed) return; setStatus(saved.ok ? `Saved ${saved.value.name}.` : `${saved.error.code}: ${saved.error.message}`, !saved.ok);
      }
      function pageSetup() {
        if (!content) return; const p = content.page;
        host.dialog({ title: 'Page setup', fields: [{ key: 'size', label: 'Paper', type: 'select', choices: [{ value: 'letter', label: 'Letter (8.5 × 11 in)' }, { value: 'a4', label: 'A4 (210 × 297 mm)' }, { value: 'legal', label: 'Legal (8.5 × 14 in)' }] },
          { key: 'orientation', label: 'Orientation', type: 'select', choices: [{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }] }, { key: 'margin', label: 'Margins (in)', type: 'number', min: 0.25, max: 2.5, step: 0.05 }, { key: 'numbers', label: 'Page numbers in the PDF', type: 'checkbox' }],
          initial: { ...p }, validate: v => { const m = Number((v as Record<string, unknown>).margin); return m >= 0.25 && m <= 2.5 ? { ok: true, value: v } : { ok: false, error: { code: 'doc.page', message: 'Margins are 0.25–2.5 in.' } }; }, preview() {}, cancel() {},
          commit: v => { const x = v as Record<string, unknown>; flush(); const page: PageSetup = { size: x.size as PageSetup['size'], orientation: x.orientation as PageSetup['orientation'], margin: Number(x.margin), numbers: !!x.numbers }; host.commit({ ...current!, value: documentContent({ operation: 'edit', value: content!, page, parse }) }, 'Page setup', current!.identity); } });
      }
      // A modal dialog makes the page inert, so editing commands wait until it has closed.
      const afterDialog = (work: () => void) => window.setTimeout(() => { if (!disposed) work(); }, 0);
      function tableDialog() {
        host.dialog({ title: 'Insert table', fields: [{ key: 'rows', label: 'Rows', type: 'number', min: 1, max: 50, step: 1 }, { key: 'cols', label: 'Columns', type: 'number', min: 1, max: 12, step: 1 }, { key: 'header', label: 'Header row', type: 'checkbox' }], initial: { rows: 3, cols: 3, header: true },
          validate: v => ({ ok: true, value: v }), preview() {}, cancel() {},
          commit: v => { const x = v as Record<string, unknown>, rows = Math.max(1, Math.min(50, Number(x.rows) | 0)), cols = Math.max(1, Math.min(12, Number(x.cols) | 0)), cell = (t: string) => `<${t}><br></${t}>`;
            afterDialog(() => exec('insertHTML', `<table><tbody>${Array.from({ length: rows }, (_, r) => `<tr>${Array.from({ length: cols }, () => cell(r === 0 && x.header ? 'th' : 'td')).join('')}</tr>`).join('')}</tbody></table><p><br></p>`, 'Insert table')); } });
      }
      function linkDialog() {
        host.dialog({ title: 'Insert link', fields: [{ key: 'url', label: 'Address (https://…)', type: 'text' }], initial: { url: 'https://' },
          validate: v => /^(https?:\/\/\S+|mailto:\S+)$/i.test(String((v as Record<string, unknown>).url)) ? { ok: true, value: v } : { ok: false, error: { code: 'doc.link', message: 'Type a web address starting with https:// or a mailto: address.' } }, preview() {}, cancel() {},
          commit: v => { const url = String((v as Record<string, unknown>).url); afterDialog(() => { restoreSelection(); if (doc.getSelection()?.isCollapsed) exec('insertHTML', `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`, 'Insert link'); else exec('createLink', url, 'Insert link'); }); } });
      }
      function pictureSize() {
        if (!picked) { setStatus('Click a picture in the document first.'); return; } const image = picked;
        host.dialog({ title: 'Picture size', fields: [{ key: 'width', label: 'Width (% of the text column)', type: 'number', min: 5, max: 100, step: 5 }], initial: { width: parseInt(image.style.width) || 100 }, validate: v => ({ ok: true, value: v }), preview() {}, cancel() {},
          commit: v => { image.style.width = `${Math.max(5, Math.min(100, Number((v as Record<string, unknown>).width)))}%`; flush('Picture size'); } });
      }
      function run(id: string) {
        setStatus('');
        if (id === 'doc.import') { void importText(); return; }
        if (id === 'doc.new') { void host.open(blank()); return; }
        if (!content) return;
        const simple: Record<string, [string, string?]> = { 'doc.bold': ['bold'], 'doc.italic': ['italic'], 'doc.underline': ['underline'], 'doc.strike': ['strikeThrough'], 'doc.alignLeft': ['justifyLeft'], 'doc.alignCenter': ['justifyCenter'], 'doc.alignRight': ['justifyRight'], 'doc.alignJustify': ['justifyFull'],
          'doc.numbers': ['insertOrderedList'], 'doc.bullets': ['insertUnorderedList'], 'doc.indent': ['indent'], 'doc.outdent': ['outdent'], 'doc.clear': ['removeFormat'], 'doc.normal': ['formatBlock', '<p>'], 'doc.h1': ['formatBlock', '<h1>'], 'doc.h2': ['formatBlock', '<h2>'], 'doc.h3': ['formatBlock', '<h3>'], 'doc.rule': ['insertHorizontalRule'] };
        if (simple[id]) { exec(simple[id]![0], simple[id]![1]); return; }
        if (id === 'doc.pageBreak') exec('insertHTML', '<hr style="break-after: page"><p><br></p>', 'Page break');
        else if (id === 'doc.picture') void insertPicture();
        else if (id === 'doc.table') tableDialog();
        else if (id === 'doc.link') linkDialog();
        else if (id === 'doc.pictureSize') pictureSize();
        else if (id === 'doc.pageSetup') pageSetup();
        else if (id === 'doc.pdf') void printDocument();
        else if (id === 'doc.html') void exportFile('html');
        else if (id === 'doc.text') void exportFile('txt');
      }
      // Toolbar wiring: mousedown keeps the text selection; selects restore it before applying.
      const onBarDown = (event: MouseEvent) => { if ((event.target as HTMLElement).closest('.doc-tool')) event.preventDefault(); };
      const onBarClick = (event: MouseEvent) => { const b = (event.target as HTMLElement).closest<HTMLElement>('.doc-tool'); if (b) { run(b.dataset.docCommand!); host.invalidate(); } };
      bar.addEventListener('mousedown', onBarDown); bar.addEventListener('click', onBarClick);
      bar.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); restoreSelection(); } });
      styleSelect.addEventListener('change', () => exec('formatBlock', `<${styleSelect.value}>`, 'Style'));
      fontSelect.addEventListener('change', () => { if (fontSelect.value) exec('fontName', fontSelect.value, 'Font'); });
      sizeSelect.addEventListener('change', () => { if (sizeSelect.value) fontSize(Number(sizeSelect.value)); });
      colourInput.addEventListener('change', () => exec('foreColor', colourInput.value, 'Font colour'));
      markInput.addEventListener('change', () => exec('hiliteColor', markInput.value, 'Highlight'));
      zoom.addEventListener('change', () => layout());
      newButton.addEventListener('click', () => { void host.open(blank()); });
      editor.addEventListener('input', () => { schedule(); setStatus(''); });
      editor.addEventListener('load', () => { info.textContent = describe(); }, true);
      editor.addEventListener('blur', () => { if (timer) flush(); });
      editor.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey || event.key === 'F10') && timer) flush();
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); saveSelection(); if (timer) flush(); styleSelect.focus({ preventScroll: true }); return; }
        if (event.key === 'Tab' && !event.ctrlKey && !event.altKey) { event.preventDefault(); exec(event.shiftKey ? 'outdent' : (doc.queryCommandState('insertOrderedList') || doc.queryCommandState('insertUnorderedList')) ? 'indent' : 'insertText', event.shiftKey ? undefined : (doc.queryCommandState('insertOrderedList') || doc.queryCommandState('insertUnorderedList')) ? undefined : '    ', 'Typing'); }
      });
      editor.addEventListener('paste', event => {
        const data = event.clipboardData; if (!data) return; event.preventDefault();
        const html = data.getData('text/html'), text = data.getData('text/plain');
        doc.execCommand('insertHTML', false, html ? sanitizeHtml(html, parse) : textToHtml(text)); flush('Paste');
      });
      editor.addEventListener('click', event => { const img = (event.target as HTMLElement).closest('img'); picked?.classList.remove('doc-picked'); picked = img; img?.classList.add('doc-picked'); host.invalidate(); });
      const onSelection = () => { if (disposed) return; saveSelection(); syncToolbar(); };
      doc.addEventListener('selectionchange', onSelection);
      return {
        render(snapshot) {
          const changed = snapshot?.identity !== current?.identity;
          if (snapshot?.id !== current?.id) { status = ''; notice.textContent = ''; notice.hidden = true; }
          current = snapshot;
          if (changed) {
            content = snapshot ? snapshot.value as DocumentContent : null;
            if (content && content.html !== ownHtml) { window.clearTimeout(timer); timer = 0; editor.innerHTML = content.html; ownHtml = content.html; picked = null; savedRange = null; }
          }
          stage.hidden = false; empty.hidden = !!content; sheet.hidden = !content; bar.toggleAttribute('inert', !content); layout(); info.textContent = describe(); info.hidden = !content;
        },
        model() {
          const on = !!content, item = (id: string, label: string, shortcut = '', enabled = on, icon?: string, toolbar = false) => ({ id, label, shortcut, enabled, ...(icon ? { icon } : {}), ...(toolbar ? { toolbar } : {}) });
          return { menus: [
            { id: 'document', label: 'Document', items: [item('doc.pdf', 'Export PDF…', '', on, 'pdf', true), item('doc.html', 'Export HTML…'), item('doc.text', 'Export plain text…'), item('doc.import', 'Import text or HTML…', '', true, 'open'), item('doc.pageSetup', 'Page setup…', '', on, 'properties', true)] },
            { id: 'insert', label: 'Insert', items: [item('doc.picture', 'Picture…', '', on, 'image'), item('doc.pictureSize', 'Picture size…', '', on && !!picked), item('doc.table', 'Table…', '', on, 'table'), item('doc.link', 'Link…', '', on, 'link'), item('doc.rule', 'Horizontal line'), item('doc.pageBreak', 'Page break', '', on, 'pageBreak')] },
            { id: 'format', label: 'Format', items: [item('doc.bold', 'Bold', 'Ctrl+B', on, 'bold'), item('doc.italic', 'Italic', 'Ctrl+I', on, 'italic'), item('doc.underline', 'Underline', 'Ctrl+U', on, 'underline'), item('doc.strike', 'Strikethrough', '', on, 'strike'),
              item('doc.normal', 'Normal text'), item('doc.h1', 'Heading 1'), item('doc.h2', 'Heading 2'), item('doc.h3', 'Heading 3'), item('doc.bullets', 'Bullets', '', on, 'listBullet'), item('doc.numbers', 'Numbering', '', on, 'listNumber'),
              item('doc.alignLeft', 'Align left', '', on, 'alignLeft'), item('doc.alignCenter', 'Centre', '', on, 'alignCenter'), item('doc.alignRight', 'Align right', '', on, 'alignRight'), item('doc.alignJustify', 'Justify', '', on, 'alignJustify'), item('doc.indent', 'Increase indent', 'Tab', on, 'indent'), item('doc.outdent', 'Decrease indent', 'Shift+Tab', on, 'outdent'), item('doc.clear', 'Clear formatting')] }],
            tools: [], panels: [] };
        },
        context: () => { const summary = describe(); info.textContent = summary; info.hidden = !content; return { viewRole: 'none', activeTool: 'text', status: status || summary }; },
        command(id) { if (timer) flush(); run(id); host.invalidate(); },
        flush,
        gesture() {},
        dispose() { if (disposed) return; if (timer) flush(); disposed = true; window.clearTimeout(timer); doc.removeEventListener('selectionchange', onSelection); host.root.replaceChildren(); },
      };
    },
  };
}
