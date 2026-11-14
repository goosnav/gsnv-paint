/**
 * PURPOSE    Validate immutable local source projects.
 * KIND       CORE
 * CONTRACT   IN: new(language?), decode(content), encode(value), put(value,file),
 *            import(value,path,language,bytes), remove(value,path), rename(value,path,to), entry(value,path).
 *            OUT: CodeDocument; encode alone returns {content:CodeDocument,assets:[]}.
 *            Paths are unique portable relative paths; text is well-formed UTF-8, without NUL.
 *            RAISES: CodeContentError for malformed schemas, paths, languages, encoding or limits.
 * GUARANTEES Pure, deterministic, deeply frozen owned output; no execution or input mutation.
 * TUNING     MAX_FILES=128, MAX_FILE_BYTES=1 MiB, MAX_PROJECT_BYTES=4 MiB, MAX_PATH=240.
 * DECISIONS  D1: Store UTF-8 text inline. Alternative: binary assets; small source projects need readable
 *            metadata and simple history. Revisit if large binary project assets become required.
 * LIMITS     Source text only; no archives, binary assets, packages, path normalization or execution.
 * TESTBENCH  src/code/code-document.test.ts -- node --import tsx --test src/code/code-document.test.ts
 */
type Language = 'javascript' | 'python' | 'html' | 'css' | 'text';
type SourceFile = Readonly<{ path: string; language: Language; text: string }>;
export type CodeDocument = Readonly<{ files: readonly SourceFile[]; entry: string }>;
export class CodeContentError extends Error { override name = 'CodeContentError'; }
type Request = { operation: 'new'; language?: Language } | { operation: 'decode'; content: unknown }
  | { operation: 'encode'; value: CodeDocument } | { operation: 'put'; value: CodeDocument; file: SourceFile }
  | { operation: 'import'; value: CodeDocument; path: string; language: Language; bytes: Uint8Array }
  | { operation: 'remove' | 'entry'; value: CodeDocument; path: string }
  | { operation: 'rename'; value: CodeDocument; path: string; to: string };
type Encoded = { content: CodeDocument; assets: never[] };
const MAX_FILES = 128, MAX_FILE_BYTES = 1024 * 1024, MAX_PROJECT_BYTES = 4 * MAX_FILE_BYTES, MAX_PATH = 240;
const LANGUAGES = ['javascript', 'python', 'html', 'css', 'text'];
const STARTERS: Record<Language, [string, string]> = {
  javascript: ['main.js', 'console.log("Hello, world!");\n'], python: ['main.py', 'print("Hello, world!")\n'],
  html: ['index.html', '<!doctype html>\n<h1>Hello, world!</h1>\n'], css: ['style.css', 'body { font-family: sans-serif; }\n'], text: ['notes.txt', ''],
};
function fail(message: string): never { throw new CodeContentError(message); }
function fields(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('Source data must be a plain record.');
  const own = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== keys.length || keys.some(key => !own[key]?.enumerable || !('value' in own[key]!))) fail('Source data has missing, extra or accessor fields.');
  return value as Record<string, unknown>;
}
function path(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > MAX_PATH || value.normalize('NFC') !== value || /[\u0000-\u001f\u007f\\:?#%]/u.test(value)) fail('Use a relative source path of at most 240 characters.');
  if (value.split('/').some(segment => !segment || segment === '.' || segment === '..' || /[. ]$|^\s/u.test(segment) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment))) fail('Source paths cannot contain parent, empty or reserved names.');
  return value;
}
function checked(value: unknown): CodeDocument {
  const record = fields(value, ['files', 'entry']);
  if (!Array.isArray(record.files) || record.files.length < 1 || record.files.length > MAX_FILES || Object.keys(record.files).length !== record.files.length) fail('A source project needs 1–128 files.');
  const used = new Set<string>(); let bytes = 0;
  const files = record.files.map((raw: unknown) => {
    const file = fields(raw, ['path', 'language', 'text']), name = path(file.path);
    if (used.has(name)) fail('Source paths must be unique.'); used.add(name);
    if (typeof file.language !== 'string' || !LANGUAGES.includes(file.language)) fail('Unsupported source language.');
    if (typeof file.text !== 'string' || file.text.includes('\0') || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(file.text)) fail('Source must be valid UTF-8 text without NUL.');
    if (file.text.length > MAX_FILE_BYTES) fail('A source file exceeds 1 MiB.');
    const length = new TextEncoder().encode(file.text).length; bytes += length;
    if (length > MAX_FILE_BYTES || bytes > MAX_PROJECT_BYTES) fail('Source exceeds the 1 MiB file or 4 MiB project limit.');
    return Object.freeze({ path: name, language: file.language as Language, text: file.text });
  });
  const entry = path(record.entry); if (!used.has(entry)) fail('Choose an existing entry file.');
  return Object.freeze({ files: Object.freeze(files), entry });
}
function operate(request: Request): CodeDocument | Encoded {
  if (request.operation === 'new') {
    const language = request.language ?? 'javascript'; if (!Object.hasOwn(STARTERS, language)) fail('Unsupported source language.');
    const [name, text] = STARTERS[language]; return checked({ files: [{ path: name, language, text }], entry: name });
  }
  if (request.operation === 'decode') return checked(request.content);
  const value = checked(request.value);
  if (request.operation === 'encode') return { content: value, assets: [] };
  if (request.operation === 'put' || request.operation === 'import') {
    let file: SourceFile;
    if (request.operation === 'put') file = request.file;
    else {
      if (!(request.bytes instanceof Uint8Array) || request.bytes.length > MAX_FILE_BYTES) fail('Source import exceeds 1 MiB.');
      let text: string; try { text = new TextDecoder('utf-8', { fatal: true }).decode(request.bytes); } catch { fail('Only valid UTF-8 source files can be imported.'); }
      file = { path: request.path, language: request.language, text };
    }
    const files = [...value.files], index = files.findIndex(item => item.path === file.path);
    if (index < 0) files.push(file); else files[index] = file;
    return checked({ files, entry: value.entry });
  }
  const index = value.files.findIndex(file => file.path === request.path); if (index < 0) fail('Source file does not exist.');
  if (request.operation === 'entry') return checked({ files: value.files, entry: request.path });
  if (request.operation === 'remove') {
    const files = value.files.filter(file => file.path !== request.path);
    return checked({ files, entry: value.entry === request.path ? files[0]?.path : value.entry });
  }
  if (request.operation === 'rename') return checked({ files: value.files.map(file => file.path === request.path ? { ...file, path: request.to } : file), entry: value.entry === request.path ? request.to : value.entry });
  return fail('Unknown source operation.');
}
export function codeDocument<T extends Request>(request: T): T extends { operation: 'encode' } ? Encoded : CodeDocument {
  return operate(request) as T extends { operation: 'encode' } ? Encoded : CodeDocument;
}
