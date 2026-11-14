/**
 * PURPOSE    Transfer explicitly chosen source files through shared browser file ports.
 * KIND       SHELL
 * CONTRACT   IN: read or write(file), FilePorts. OUT: opened bytes, saved or cancelled outcome.
 *            RAISES: Error before reading imports over 1 MiB; source validation is K01.
 * GUARANTEES No uploads, package fetches or implicit writes; cancellation is never reported saved.
 * TUNING     MAX_BYTES=1 MiB matches the source document's per-file limit.
 * DECISIONS  D1: Reuse shared pickers/downloads. Alternative: a separate file integration;
 *            rejected to preserve consistent permission handling. Revisit if directory import is approved.
 * LIMITS     One UTF-8 source file at a time; no archives, binary files or directory selection.
 * TESTBENCH  src/code/code-files.test.ts -- node --import tsx --test src/code/code-files.test.ts
 */
import { fileAccess, type FilePorts } from '../shared/file-access.ts';
import type { CodeDocument } from './code-document.ts';
type File = CodeDocument['files'][number];
const MAX_BYTES = 1024 * 1024;
export async function codeFiles(request: { operation: 'read' } | { operation: 'write'; file: File }, ports: FilePorts): Promise<{ kind: 'cancelled' | 'saved' } | { kind: 'opened'; path: string; language: File['language']; bytes: Uint8Array }> {
  const mime = { javascript: 'text/javascript', python: 'text/x-python', html: 'text/html', css: 'text/css', text: 'text/plain' };
  const result = request.operation === 'read' ? await fileAccess({ op: 'open', maxBytes: MAX_BYTES, accept: { 'text/plain': ['.js', '.mjs', '.py', '.html', '.htm', '.css', '.txt', '.json', '.md'] } }, ports) : await fileAccess({ op: 'save', name: request.file.path.split('/').at(-1)!, mime: mime[request.file.language], bytes: new TextEncoder().encode(request.file.text) }, ports);
  if ('cancelled' in result) return { kind: 'cancelled' }; if (!result.ok) throw new Error(result.error.message); if (request.operation === 'write') return { kind: 'saved' };
  const length = result.value.bytes.reduce((sum, part) => sum + part.length, 0); if (length > MAX_BYTES) throw new Error('A source file must be no larger than 1 MiB.');
  const bytes = new Uint8Array(length); let offset = 0; for (const part of result.value.bytes) { bytes.set(part, offset); offset += part.length; }
  const path = result.value.name, extension = path.split('.').at(-1)!.toLowerCase(), language: File['language'] = ['js', 'mjs'].includes(extension) ? 'javascript' : extension === 'py' ? 'python' : ['html', 'htm'].includes(extension) ? 'html' : extension === 'css' ? 'css' : 'text';
  return { kind: 'opened', path, language, bytes };
}
