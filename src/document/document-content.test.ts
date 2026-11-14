import { test } from 'node:test'; import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { documentContent, sanitizeHtml, wordCount, pageCss, pageInches, DEFAULT_PAGE } from './document-content.ts';

const parse = (html: string) => new JSDOM(html).window.document;

test('DOC-CONTENT sanitizer keeps formatting and drops anything that could run', () => {
  const dirty = '<h1 onclick="x()">Title</h1><p style="text-align:center;position:fixed;color:red">Hi <b>there</b> <script>alert(1)</script><u>u</u></p>'
    + '<img src="javascript:alert(1)"><img src="data:image/png;base64,AAAA" alt="a" onerror="x()"><a href="javascript:x()">bad</a><a href="https://goosnav.com">ok</a>'
    + '<iframe src="https://x"></iframe><custom-el>kept text</custom-el><p style="background:url(http://x)">bg</p><font face="Arial" color="#ff0000">f</font>';
  const clean = sanitizeHtml(dirty, parse);
  assert.equal(clean, '<h1>Title</h1><p style="text-align: center; color: red">Hi <b>there</b> <u>u</u></p>'
    + '<img src="data:image/png;base64,AAAA" alt="a">bad<a href="https://goosnav.com" rel="noopener noreferrer" target="_blank">ok</a>'
    + 'kept text<p>bg</p><font face="Arial" color="#ff0000">f</font>');
  assert.equal(sanitizeHtml(clean, parse), clean, 'idempotent');
});

test('DOC-CONTENT edits, page setup and native round trip', () => {
  let d = documentContent({ operation: 'new' }); assert.equal(d.html, '<p><br></p>'); assert.deepEqual(d.page, DEFAULT_PAGE);
  d = documentContent({ operation: 'edit', value: d, html: '<p>One two <i>three</i></p><script>x</script>', parse }); assert.equal(d.html, '<p>One two <i>three</i></p>');
  d = documentContent({ operation: 'edit', value: d, page: { size: 'a4', orientation: 'landscape', margin: 0.5, numbers: true }, parse });
  assert.deepEqual(pageInches(d.page), [11.69, 8.27]); assert.match(pageCss(d.page), /size: 11.69in 8.27in; margin: 0.5in; @bottom-center \{ content: counter\(page\)/);
  assert.throws(() => documentContent({ operation: 'edit', value: d, page: { ...d.page, margin: 4 }, parse }), { name: 'DocumentEditError' });
  const encoded = documentContent({ operation: 'encode', value: d }); assert.deepEqual(encoded.assets, []);
  assert.deepEqual(documentContent({ operation: 'decode', content: JSON.parse(JSON.stringify(encoded.content)), parse }), d);
  assert.equal(documentContent({ operation: 'decode', content: { ...encoded.content, html: '<p onmouseover="x()">a</p>' }, parse }).html, '<p>a</p>');
  assert.throws(() => documentContent({ operation: 'decode', content: { html: '', page: { ...d.page, size: 'b5' } }, parse }), { name: 'DocumentContentError' });
  assert.equal(wordCount("It's a well-known fact, 42 times."), 6); assert.equal(wordCount('   '), 0);
});
