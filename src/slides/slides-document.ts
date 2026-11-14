/**
 * PURPOSE    Maintain an immutable, locally editable slide deck.
 * KIND       CORE
 * CONTRACT   IN: new/read/edit/encode/decode requests with caller-issued IDs and local raster assets.
 *            OUT: deeply frozen deck or owned native metadata/assets; source order and IDs retained.
 *            RAISES: SlidesContentError for malformed persisted input; SlidesEditError for invalid edits.
 * GUARANTEES Pure, deterministic, no I/O, no remote resources, no mutation or partial publication.
 * TUNING     MAX_SLIDES=500, MAX_ELEMENTS=2000 per slide, MAX_IMAGE=20 MiB, MAX_TEXT=100000 per element.
 * DECISIONS  D1: Immutable base64 image content in memory, binary native assets on disk. Alternative:
 *            shared mutable byte arrays can corrupt undo. Revisit if immutable buffer storage is available.
 *            D2: Plain text with per-element styles keeps editing/print consistent without executable HTML.
 *            Revisit if rich inline formatting is explicitly added to the persisted schema.
 * LIMITS     Local raster images only; codec decoding belongs to the import shell. No animation or masters.
 * TESTBENCH  src/slides/slides-document.test.ts -- run with: node --import tsx --test src/slides/slides-document.test.ts
 */
type Box = { id: string; x: number; y: number; width: number; height: number; rotation: number };
type Element = Box & ({ kind: 'text'; text: string; fontSize: number; fontFamily: 'Arial' | 'Georgia' | 'Courier New'; color: string; bold: boolean; italic: boolean; align: 'left' | 'center' | 'right' }
  | { kind: 'rectangle' | 'ellipse'; fill: string; stroke: string; strokeWidth: number }
  | { kind: 'image'; assetId: string; alt: string });
type Picture = { id: string; mime: string; width: number; height: number; data: string };
type Theme = { background: string; text: string; accent: string };
type Deck = { width: number; height: number; theme: Theme; slides: { id: string; name: string; background: string; elements: Element[] }[]; images: Picture[] };
type Frozen<T> = T extends object ? { readonly [K in keyof T]: Frozen<T[K]> } : T;
export type SlidesDocument = Frozen<Deck>;
export type SlidesAction =
  | { kind: 'slide-add'; id: string; after?: string }
  | { kind: 'slide-duplicate'; id: string; duplicateId: string; elementIds: string[] }
  | { kind: 'slide-remove'; id: string } | { kind: 'slide-move'; id: string; index: number }
  | { kind: 'slide-name'; id: string; name: string } | { kind: 'slide-background'; id: string; color: string }
  | { kind: 'element-add'; slide: string; id: string; element: Element['kind']; image?: Picture }
  | { kind: 'element-update'; slide: string; id: string; changes: Partial<Omit<Box, 'id'>> & { text?: string; fontSize?: number; fontFamily?: 'Arial' | 'Georgia' | 'Courier New'; color?: string; bold?: boolean; italic?: boolean; align?: 'left' | 'center' | 'right'; fill?: string; stroke?: string; strokeWidth?: number; alt?: string } }
  | { kind: 'element-remove'; slide: string; id: string } | { kind: 'element-layer'; slide: string; id: string; index: number }
  | { kind: 'canvas'; width: number; height: number } | { kind: 'theme'; theme: Theme };
type Asset = { readonly id: string; readonly mime: string; readonly bytes: Uint8Array };
type Encoded = { content: Omit<Deck, 'images'> & { images: Omit<Picture, 'data'>[] }; assets: Asset[] };
type Request = { operation: 'new'; slideId: string } | { operation: 'read'; value: unknown }
  | { operation: 'edit'; value: SlidesDocument; action: SlidesAction } | { operation: 'encode'; value: SlidesDocument }
  | { operation: 'decode'; content: unknown; assets: readonly Asset[] };
const MAX_SLIDES = 500, MAX_ELEMENTS = 2000, MAX_IMAGE = 20 * 1024 * 1024, MAX_TEXT = 100000;
const copy = <T>(value: T): T => (Array.isArray(value) ? value.map(copy) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copy(child)])) : value) as T;
const freeze = <T>(value: T): Frozen<T> => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value as Frozen<T>; };
const bytes = (data: string) => { const text=atob(data),result=new Uint8Array(text.length);for(let i=0;i<text.length;i++)result[i]=text.charCodeAt(i);return result; };
const base64 = (value: Uint8Array) => { let text = ''; for (let i = 0; i < value.length; i += 0x8000) text += String.fromCharCode(...value.subarray(i, i + 0x8000)); return btoa(text); };
function validate(input: unknown, fail: (message: string) => never): Deck {
  const keys = (v: unknown, fields: string) => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) fail('Expected a plain slide record.');
    const descriptors = Object.getOwnPropertyDescriptors(v);
    if (Reflect.ownKeys(v!).length !== fields.split(' ').length || fields.split(' ').some(k => !Object.hasOwn(descriptors, k) || !('value' in descriptors[k]!))) fail('Slide record has missing or unsupported fields.');
  };
  const list = (v: unknown, max: number) => { if (!Array.isArray(v) || v.length > max || Reflect.ownKeys(v).length !== v.length + 1 || Array.from({ length: v.length }, (_, i) => i).some(i => !Object.hasOwn(v, i))) fail('Slide list is invalid or too large.'); };
  const number = (v: unknown, min: number, max: number) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(`Expected a finite number from ${min} to ${max}.`); };
  const color = (v: unknown) => { if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v)) fail('Colors must be six-digit hexadecimal values.'); };
  const text = (v: unknown, max = MAX_TEXT) => { if (typeof v !== 'string' || v.length > max) fail('Slide text is invalid or too long.'); };
  const ids = new Set<string>(), id = (v: unknown) => { if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(v) || ids.has(v)) fail('Slide, element and image IDs must be unique identifiers.'); ids.add(v as string); };
  keys(input, 'width height theme slides images'); const deck = input as Deck;
  number(deck.width, 160, 3840); number(deck.height, 160, 3840); keys(deck.theme, 'background text accent'); Object.values(deck.theme).forEach(color);
  list(deck.images, MAX_ELEMENTS); const imageIds = new Set<string>();
  for (const p of deck.images) {
    keys(p, 'id mime width height data'); id(p.id); imageIds.add(p.id); number(p.width, 1, 40000); number(p.height, 1, 40000);
    if (!Number.isInteger(p.width) || !Number.isInteger(p.height) || p.width * p.height > 40000000) fail('Image dimensions exceed 40 million pixels.');
    if (!['image/png','image/jpeg','image/gif','image/webp'].includes(p.mime) || typeof p.data !== 'string' || !p.data.length || p.data.length % 4 || p.data.length > Math.ceil(MAX_IMAGE / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(p.data)) fail('Images must be local PNG, JPEG, GIF or WebP data under 20 MiB.');
    // Only native encoding needs the full byte buffer; editing inspects a bounded signature.
    const b = bytes(p.data.slice(0,16)), prefix = String.fromCharCode(...b), size=p.data.length/4*3-(p.data.endsWith('==')?2:p.data.endsWith('=')?1:0);
    if (size > MAX_IMAGE || !(p.mime === 'image/png' ? prefix.startsWith('\x89PNG\r\n\x1a\n') : p.mime === 'image/jpeg' ? b[0] === 255 && b[1] === 216 && b[2] === 255 : p.mime === 'image/gif' ? /^GIF8[79]a/.test(prefix) : prefix.startsWith('RIFF') && prefix.slice(8) === 'WEBP')) fail('Image data does not match its declared format.');
  }
  list(deck.slides, MAX_SLIDES); if (!deck.slides.length) fail('A deck needs at least one slide.');
  for (const slide of deck.slides) {
    keys(slide, 'id name background elements'); id(slide.id); text(slide.name, 200); if (!slide.name.trim()) fail('A slide needs a name.'); color(slide.background); list(slide.elements, MAX_ELEMENTS);
    for (const e of slide.elements) {
      const extra = e?.kind === 'text' ? 'text fontSize fontFamily color bold italic align' : e?.kind === 'image' ? 'assetId alt' : ['rectangle','ellipse'].includes(e?.kind) ? 'fill stroke strokeWidth' : fail('Unsupported slide element.');
      keys(e, `id kind x y width height rotation ${extra}`); id(e.id); number(e.x, -100000, 100000); number(e.y, -100000, 100000); number(e.width, 0.1, 100000); number(e.height, 0.1, 100000); number(e.rotation, -360, 360);
      if (e.kind === 'text') { text(e.text); number(e.fontSize, 6, 400); color(e.color); if (!['Arial','Georgia','Courier New'].includes(e.fontFamily) || !['left','center','right'].includes(e.align) || typeof e.bold !== 'boolean' || typeof e.italic !== 'boolean') fail('Invalid text style.'); }
      else if (e.kind === 'image') { if (!imageIds.has(e.assetId)) fail('An image element references a missing asset.'); text(e.alt); }
      else { color(e.fill); color(e.stroke); number(e.strokeWidth, 0, 50); }
    }
  }
  return deck;
}
export function slidesDocument(request: Extract<Request, { operation: 'encode' }>): Encoded;
export function slidesDocument(request: Exclude<Request, { operation: 'encode' }>): SlidesDocument;
export function slidesDocument(request: Request): SlidesDocument | Encoded {
  const fail = (message: string): never => { throw Object.assign(new Error(message), { name: request.operation === 'edit' || request.operation === 'new' ? 'SlidesEditError' : 'SlidesContentError' }); };
  if (request.operation === 'new') return freeze(validate({ width: 960, height: 540, theme: { background: '#ffffff', text: '#000000', accent: '#316ac5' }, slides: [{ id: request.slideId, name: 'Slide 1', background: '#ffffff', elements: [] }], images: [] }, fail));
  if (request.operation === 'read') return freeze(copy(validate(request.value, fail)));
  if (request.operation === 'encode') {
    const deck = validate(request.value, fail), { images, ...rest } = copy(deck);
    return { content: { ...rest, images: images.map(({ data: _data, ...image }) => image) }, assets: images.map(p => ({ id: p.id, mime: p.mime, bytes: bytes(p.data) })) };
  }
  if (request.operation === 'decode') {
    const content = request.content as Encoded['content']; if (!content || !Array.isArray(content.images) || !Array.isArray(request.assets) || content.images.length !== request.assets.length) fail('Native image assets are missing or duplicated.');
    const seen = new Set<string>();
    const images = content.images.map(p => {
      if (!p || Object.keys(p).sort().join() !== 'height,id,mime,width' || seen.has(p.id)) fail('Invalid native image asset metadata.'); seen.add(p.id);
      const matches = request.assets.filter(a => a.id === p.id), asset = matches[0];
      if (matches.length !== 1 || !asset || asset.mime !== p.mime || !(asset.bytes instanceof Uint8Array) || asset.bytes.byteLength > MAX_IMAGE) fail('Native image asset is missing or has the wrong format.');
      return { ...p, data: base64(asset!.bytes) };
    });
    return freeze(copy(validate({ ...content, images }, fail)));
  }
  const deck = copy(request.value) as Deck, a = request.action;
  const slide = (id: string) => deck.slides.find(s => s.id === id) ?? fail('That slide no longer exists.');
  const unique = (id: string) => { if ([...deck.slides, ...deck.slides.flatMap(s => s.elements), ...deck.images].some(v => v.id === id)) fail('That ID is already used.'); return id; };
  const move = <T>(values: T[], index: number, to: number) => { if (!Number.isInteger(to) || to < 0 || to >= values.length) fail('The new position is outside the list.'); const [item] = values.splice(index, 1); values.splice(to, 0, item!); };
  if (a.kind === 'slide-add') { const at = a.after === undefined ? deck.slides.length : deck.slides.indexOf(slide(a.after)) + 1; deck.slides.splice(at, 0, { id: unique(a.id), name: `Slide ${deck.slides.length + 1}`, background: deck.theme.background, elements: [] }); }
  else if (a.kind === 'slide-duplicate') {
    const source = slide(a.id); if (a.elementIds.length !== source.elements.length) fail('Duplicating a slide needs a new ID for every element.');
    const duplicate = copy(source); duplicate.id = unique(a.duplicateId); duplicate.name = `${source.name.slice(0, 195)} copy`;
    duplicate.elements.forEach((e, i) => e.id = unique(a.elementIds[i]!)); deck.slides.splice(deck.slides.indexOf(source) + 1, 0, duplicate);
  } else if (a.kind === 'slide-remove') { const target = slide(a.id); if (deck.slides.length === 1) fail('Keep at least one slide in the deck.'); deck.slides.splice(deck.slides.indexOf(target), 1); }
  else if (a.kind === 'slide-move') move(deck.slides, deck.slides.indexOf(slide(a.id)), a.index);
  else if (a.kind === 'slide-name') slide(a.id).name = a.name;
  else if (a.kind === 'slide-background') slide(a.id).background = a.color;
  else if (a.kind === 'canvas') { deck.width = a.width; deck.height = a.height; }
  else if (a.kind === 'theme') deck.theme = copy(a.theme);
  else if (a.kind === 'element-add') {
    const target = slide(a.slide), box = { id: unique(a.id), x: 60, y: 60, width: 240, height: 160, rotation: 0 };
    if (a.element === 'text') target.elements.push({ ...box, width: 480, height: 120, kind: 'text', text: 'Type your text', fontSize: 32, fontFamily: 'Arial', color: deck.theme.text, bold: false, italic: false, align: 'left' });
    else if (a.element === 'rectangle' || a.element === 'ellipse') target.elements.push({ ...box, kind: a.element, fill: deck.theme.accent, stroke: '#000000', strokeWidth: 0 });
    else if (a.element === 'image') {
      if (!a.image) fail('Choose a valid image before inserting it.'); unique(a.image!.id); deck.images.push(copy(a.image!));
      const scale = Math.min(1, 640 / a.image!.width, 360 / a.image!.height);
      target.elements.push({ ...box, width: a.image!.width * scale, height: a.image!.height * scale, kind: 'image', assetId: a.image!.id, alt: 'Picture' });
    } else fail('Unsupported element kind.');
  } else {
    const target = slide(a.slide), element = target.elements.find(e => e.id === a.id) ?? fail('That element no longer exists.');
    if (a.kind === 'element-update') { if (Object.keys(a.changes).some(k => ['id','kind','assetId'].includes(k))) fail('An element identity cannot be changed.'); Object.assign(element, copy(a.changes)); }
    else if (a.kind === 'element-remove') target.elements.splice(target.elements.indexOf(element), 1);
    else if (a.kind === 'element-layer') move(target.elements, target.elements.indexOf(element), a.index);
    else fail('Unsupported edit.');
  }
  const used = new Set(deck.slides.flatMap(s => s.elements.flatMap(e => e.kind === 'image' ? [e.assetId] : [])));
  deck.images = deck.images.filter(p => used.has(p.id));
  return freeze(validate(deck, fail));
}
