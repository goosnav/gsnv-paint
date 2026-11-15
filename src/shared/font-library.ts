/**
 * PURPOSE    Maintain the device's imported Paint fonts.
 * KIND       SHELL
 * CONTRACT   IN: font set, FontFace constructor, Crypto, optional IndexedDB; local name/bytes.
 *            OUT: import() returns a loaded font choice; choices() restores stored faces.
 *            A persistence notice means session-only availability. dispose() releases faces.
 *            RAISES: readable Error for invalid files, unavailable font API or closed library.
 * GUARANTEES Binary sources only; no network; hash family IDs; identical bytes register once.
 *            Registration follows successful font loading. Disposal prevents late registration.
 * TUNING     MAX_FONT_BYTES=32 MiB. IndexedDB name/version below; no project schema changes.
 * DECISIONS  D1: Native FontFace validates fonts. Alternative: ship a parser; unnecessary for
 *            browser text rendering. Revisit if editable text needs cross-workspace embedding.
 *            D2: Store source bytes in IndexedDB. Alternative: localStorage; binary/quota limits.
 * LIMITS     Browser storage may be cleared/evicted; private browsing may be session-only.
 *            Restores faces lazily when Text is opened. Font styles use browser synthesis.
 * TESTBENCH  src/shared/font-library.test.ts -- node --import tsx --test src/shared/font-library.test.ts
 */
export const MAX_FONT_BYTES = 32 * 1024 * 1024;
export type FontChoice = { value: string; label: string; notice?: string };
type Ports = { fonts: FontFaceSet; FontFace: typeof FontFace; crypto: Crypto; storage: IDBFactory | undefined };
type Source = { id: string; name: string; bytes: Uint8Array; label?: string };
const SESSION = 'Available for this session. Browser storage could not remember this font; reimport it after reopening.';
export function fontLibrary(ports: Ports) {
  let closed = false, restoring: Promise<void> | undefined, restoreNotice: string | undefined;
  const entries = new Map<string, FontChoice>(), faces = new Set<FontFace>();
  const alive = () => { if (closed) throw new Error('The font library is closed.'); };
  const stored = <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) => new Promise<T>((resolve, reject) => {
    if (!ports.storage) { reject(new Error('Browser storage is unavailable.')); return; }
    const request = ports.storage.open('gsnv-paint-fonts', 1); let abandoned = false;
    request.onupgradeneeded = () => { request.result.createObjectStore('fonts', { keyPath: 'id' }); };
    request.onerror = () => reject(request.error ?? new Error('Font storage could not be opened.'));
    request.onblocked = () => { abandoned = true; reject(new Error('Font storage is busy in another tab.')); };
    request.onsuccess = () => {
      const db = request.result;
      if (abandoned || closed) { db.close(); reject(new Error('The font library is closed.')); return; }
      try {
        const tx = db.transaction('fonts', mode), result = action(tx.objectStore('fonts'));
        tx.oncomplete = () => { db.close(); resolve(result.result); };
        tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Font storage failed.')); };
      } catch (cause) { db.close(); reject(cause); }
    };
  });
  const checked = (name: string, bytes: Uint8Array) => {
    alive();
    if (typeof name !== 'string' || !/\.(ttf|otf)$/i.test(name)) throw new Error('Choose a TrueType (.ttf) or OpenType (.otf) font.');
    if (!(bytes instanceof Uint8Array) || !bytes.length) throw new Error('This is not a valid TTF or OTF font.');
    if (bytes.byteLength > MAX_FONT_BYTES) throw new Error('Choose a font up to 32 MiB.');
    const signature = Array.from(bytes.subarray(0, 4)).join(',');
    if (!['0,1,0,0', '79,84,84,79', '116,114,117,101'].includes(signature)) throw new Error('This is not a valid TTF or OTF font.');
    if (!ports.FontFace || !ports.fonts || !ports.crypto?.subtle) throw new Error('Local fonts are unavailable in this browser.');
    return bytes.slice();
  };
  const register = async (name: string, bytes: Uint8Array, savedLabel?: string): Promise<{ id: string; choice: FontChoice; bytes: Uint8Array<ArrayBuffer>; added: boolean }> => {
    const copy = checked(name, bytes);
    const digest = await ports.crypto.subtle.digest('SHA-256', copy); alive();
    const id = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    const known = entries.get(id); if (known) return { id, choice: known, bytes: copy, added: false };
    const family = `gsnv-font-${id}`; let face: FontFace;
    try { face = await new ports.FontFace(family, copy).load(); }
    catch { throw new Error('The browser could not read this font. Try another TTF or OTF file.'); }
    alive();
    // Another import may have finished while this face loaded.
    const existing = entries.get(id); if (existing) return { id, choice: existing, bytes: copy, added: false };
    ports.fonts.add(face); faces.add(face);
    const nameLabel = name.replace(/\.(ttf|otf)$/i, '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 100) || 'Imported font';
    const preferred = typeof savedLabel === 'string' && savedLabel.trim() ? savedLabel.slice(0, 120) : nameLabel;
    let label = preferred, suffix = 2;
    while ([...entries.values()].some(entry => entry.label === label)) label = `${preferred} (${suffix++})`;
    const choice = { value: `"${family}"`, label }; entries.set(id, choice);
    return { id, choice, bytes: copy, added: true };
  };
  const restore = () => restoring ??= (async () => {
    let records: Source[];
    try { records = await stored<Source[]>('readonly', store => store.getAll()); }
    catch { restoreNotice = 'Saved fonts are unavailable. New imports can still be used for this session.'; return; }
    for (const record of records) {
      alive();
      try { await register(record.name, record.bytes, record.label); }
      catch { restoreNotice = 'Some saved fonts could not be loaded. Reimport those fonts to use them.'; }
    }
  })();
  return {
    async choices(): Promise<{ choices: FontChoice[]; notice?: string }> {
      alive(); await restore(); alive();
      return { choices: [...entries.values()].map(c => ({ ...c })).sort((a, b) => a.label.localeCompare(b.label)), ...(restoreNotice ? { notice: restoreNotice } : {}) };
    },
    async import(name: string, bytes: Uint8Array): Promise<FontChoice> {
      checked(name, bytes); await restore();
      const result = await register(name, bytes);
      if (result.added) {
        try { await stored('readwrite', store => store.put({ id: result.id, name, bytes: result.bytes, label: result.choice.label })); }
        catch { result.choice.notice = SESSION; }
      }
      alive(); return { ...result.choice };
    },
    dispose() { if (closed) return; closed = true; for (const face of faces) ports.fonts.delete(face); faces.clear(); entries.clear(); },
  };
}
