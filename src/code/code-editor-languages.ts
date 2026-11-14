/**
 * PURPOSE    Select a locally bundled CodeMirror syntax parser.
 * KIND       SHELL
 * CONTRACT   IN: validated source language. OUT: matching CodeMirror extension or plain text.
 *            RAISES: vendor parser construction errors propagate.
 * GUARANTEES No source execution, language-server requests or dynamic package loads.
 * TUNING     The language table matches the document's five supported languages.
 * DECISIONS  D1: Bundle the four parsers. Alternative: remote language service; rejected for
 *            offline editing and privacy. Revisit if another source language is approved.
 * LIMITS     Syntax highlighting only; no type checking or runtime diagnostics.
 * TESTBENCH  src/code/code-editor.browser.spec.ts -- node node_modules/@playwright/test/cli.js test --config src/code/code-workspace.playwright.config.ts
 */
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import type { CodeDocument } from './code-document.ts';
export function codeLanguage(language: CodeDocument['files'][number]['language']) {
  return language === 'javascript' ? javascript() : language === 'python' ? python() : language === 'html' ? html() : language === 'css' ? css() : [];
}
