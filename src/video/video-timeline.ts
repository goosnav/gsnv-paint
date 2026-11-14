/**
 * PURPOSE    Hold and edit a basic video project: a sequence of clips plus title overlays.
 * KIND       CORE
 * CONTRACT   videoTimeline({operation}) with 'new' | 'edit' {value, op} | 'locate' {value, time} | 'encode' | 'decode'.
 *            Clips play one after another; each has in/out points in its source, fades and volume. Images
 *            are clips with a chosen duration. Titles overlay the sequence at a start time for a duration.
 *            OUT: immutable VideoContent (imports own bytes; later history shares them), or a located frame, or
 *            {content Json, assets} for the native container.
 *            RAISES: VideoEditError for invalid operations; VideoContentError for malformed files.
 * GUARANTEES Pure and deterministic; every edit returns a new value and leaves the input untouched.
 *            Bin-only imports own their bytes and never resize or place a clip. Clip
 *            deletion retains media; only explicit unreferenced bin removal releases it.
 *            Native IDs are unique within each collection; assets are a one-to-one
 *            nonempty byte mapping. End retains offset/fade but samples before out.
 * TUNING     MIN_CLIP=0.1 s; End sample margin 1 microsecond, or one representable
 *            predecessor when that margin rounds away; never sample before in.
 * DECISIONS  D1: One sequence track (clips never overlap) plus a title track: covers trimming, splitting,
 *            reordering and captions without a multi-track compositor. Revisit if: picture-in-picture is needed.
 * LIMITS     No transitions besides fades; a single frame size per project.
 * TESTBENCH  src/video/video-timeline.test.ts -- run with: node --import tsx --test src/video/video-timeline.test.ts
 */
export type Media = { id: string; name: string; mime: string; kind: 'video' | 'image'; duration: number; width: number; height: number };
export type Clip = { id: string; mediaId: string; in: number; out: number; fadeIn: number; fadeOut: number; volume: number };
export type Title = { id: string; text: string; start: number; duration: number; size: number; color: string; position: 'top' | 'middle' | 'bottom'; background: boolean };
export type VideoContent = { readonly width: number; readonly height: number; readonly fps: number; readonly media: readonly Media[]; readonly clips: readonly Clip[]; readonly titles: readonly Title[]; readonly bytes: ReadonlyMap<string, Uint8Array> };
export type VideoOp =
  | { kind: 'add-media'; media: Media; bytes: Uint8Array; clipId: string; imageSeconds?: number }
  | { kind: 'import-media'; media: Media; bytes: Uint8Array }
  | { kind: 'place-media'; mediaId: string; clipId: string; imageSeconds?: number }
  | { kind: 'remove-media'; mediaId: string }
  | { kind: 'trim'; id: string; in: number; out: number } | { kind: 'clip'; id: string; fadeIn?: number; fadeOut?: number; volume?: number }
  | { kind: 'split'; time: number; newId: string } | { kind: 'move'; id: string; index: number } | { kind: 'delete'; id: string }
  | { kind: 'title'; title: Title } | { kind: 'delete-title'; id: string } | { kind: 'size'; width: number; height: number };
export const MIN_CLIP = 0.1;
const editFail = (message: string): never => { throw Object.assign(new Error(message), { name: 'VideoEditError' }); };
const fileFail = (message: string): never => { throw Object.assign(new Error(message), { name: 'VideoContentError' }); };
const finite = (...values: number[]) => values.every(Number.isFinite);
const validId = (id: unknown): id is string => typeof id === 'string' && id.length > 0;
const freeze = (v: Omit<VideoContent, never>): VideoContent => Object.freeze({ ...v, media: Object.freeze([...v.media]), clips: Object.freeze(v.clips.map(c => Object.freeze({ ...c }))), titles: Object.freeze(v.titles.map(t => Object.freeze({ ...t }))) });

function uniqueIds(records: readonly unknown[], kind: string, fail: (message: string) => never) {
  const ids = new Set<string>();
  for (const record of records) {
    const id = record && typeof record === 'object' && !Array.isArray(record) ? (record as { id?: unknown }).id : undefined;
    if (!validId(id) || ids.has(id)) fail(`Each ${kind} record needs a unique nonempty string ID.`);
    ids.add(id);
  }
}
function checkMedia(m: Media, fail: (message: string) => never) {
  if (!m || !validId(m.id) || typeof m.name !== 'string' || typeof m.mime !== 'string' || !['video', 'image'].includes(m.kind) || !finite(m.duration, m.width, m.height) || m.duration <= 0 || !Number.isInteger(m.width) || !Number.isInteger(m.height) || m.width < 1 || m.height < 1) fail('A media record needs an ID, supported metadata and positive integer dimensions.');
}
function beforeEnd(out: number): number {
  const sample = out - 0.000001;
  if (sample < out) return sample;
  // Positive finite trim ends: decrementing their IEEE-754 bits gives nextDown.
  const bits = new DataView(new ArrayBuffer(8)); bits.setFloat64(0, out);
  bits.setBigUint64(0, bits.getBigUint64(0) - 1n); return bits.getFloat64(0);
}

export const clipLength = (c: Clip) => c.out - c.in;
export const duration = (v: VideoContent) => v.clips.reduce((s, c) => s + clipLength(c), 0);
/** Start time of each clip on the sequence. */
export const starts = (v: VideoContent) => { let t = 0; return v.clips.map(c => { const s = t; t += clipLength(c); return s; }); };

function checkTitle(t: Title, fail: (m: string) => never) {
  if (!t || typeof t.id !== 'string' || !t.id || typeof t.text !== 'string' || !finite(t.start, t.duration, t.size) || t.start < 0 || t.duration < MIN_CLIP || t.size < 8 || t.size > 400 || !/^#[0-9a-f]{6}$/i.test(t.color) || !['top', 'middle', 'bottom'].includes(t.position) || typeof t.background !== 'boolean') fail('Titles need text, a start, a duration of at least 0.1 s, a size of 8–400 and a #rrggbb colour.');
}
function checkClip(c: Clip, media: readonly Media[], fail: (m: string) => never) {
  if (!c || !validId(c.id) || !validId(c.mediaId)) fail('A clip needs nonempty string IDs and an existing media reference.');
  const m = media.find(m => m.id === c.mediaId);
  if (!m || !finite(c.in, c.out, c.fadeIn, c.fadeOut, c.volume) || c.in < 0 || c.out - c.in < MIN_CLIP - 1e-9 || (m.kind === 'video' && c.out > m.duration + 1e-6) || c.fadeIn < 0 || c.fadeOut < 0 || c.fadeIn + c.fadeOut > c.out - c.in + 1e-9 || c.volume < 0 || c.volume > 2) fail('Clip timings must stay inside the source, fades must fit the clip and volume is 0–200 %.');
}

type Request = { operation: 'new'; width?: number; height?: number } | { operation: 'edit'; value: VideoContent; op: VideoOp } | { operation: 'locate'; value: VideoContent; time: number }
  | { operation: 'encode'; value: VideoContent } | { operation: 'decode'; content: unknown; assets: readonly { id: string; bytes: Uint8Array }[] };
type Located = { index: number; clip: Clip; media: Media; offset: number; source: number; fade: number } | null;
type Encoded = { content: { width: number; height: number; fps: number; media: Media[]; clips: Clip[]; titles: Title[] }; assets: { id: string; mime: string; bytes: Uint8Array }[] };
export function videoTimeline(request: Extract<Request, { operation: 'locate' }>): Located;
export function videoTimeline(request: Extract<Request, { operation: 'encode' }>): Encoded;
export function videoTimeline(request: Exclude<Request, { operation: 'locate' | 'encode' }>): VideoContent;
export function videoTimeline(request: Request): VideoContent | Located | Encoded {
  if (request.operation === 'new') return freeze({ width: request.width ?? 1280, height: request.height ?? 720, fps: 30, media: [], clips: [], titles: [], bytes: new Map() });
  if (request.operation === 'locate') {
    const v = request.value, s = starts(v);
    for (let i = 0; i < v.clips.length; i++) {
      const c = v.clips[i]!, len = clipLength(c);
      if (request.time >= s[i]! && (request.time < s[i]! + len || i === v.clips.length - 1 && request.time <= s[i]! + len)) {
        const offset = Math.min(len, request.time - s[i]!), fade = Math.min(1, c.fadeIn > 0 ? offset / c.fadeIn : 1, c.fadeOut > 0 ? (len - offset) / c.fadeOut : 1);
        const sample = c.in + offset, source = request.time === s[i]! + len || sample >= c.out ? Math.max(c.in, beforeEnd(c.out)) : sample;
        return { index: i, clip: c, media: v.media.find(m => m.id === c.mediaId)!, offset, source, fade: Math.max(0, fade) };
      }
    }
    return null;
  }
  if (request.operation === 'encode') {
    const v = request.value;
    return { content: { width: v.width, height: v.height, fps: v.fps, media: v.media.map(m => ({ ...m })), clips: v.clips.map(c => ({ ...c })), titles: v.titles.map(t => ({ ...t })) }, assets: v.media.map(m => ({ id: `media-${m.id}`, mime: m.mime, bytes: v.bytes.get(m.id)! })) };
  }
  if (request.operation === 'decode') {
    const c = request.content as Encoded['content'];
    if (!c || typeof c !== 'object' || Object.keys(c).sort().join() !== 'clips,fps,height,media,titles,width' || !Number.isInteger(c.width) || !Number.isInteger(c.height) || c.width < 16 || c.height < 16 || c.width > 3840 || c.height > 2160 || c.fps !== 30 || ![c.media, c.clips, c.titles].every(Array.isArray)) fileFail('This video project uses an unsupported layout.');
    uniqueIds(c.media, 'media', fileFail); uniqueIds(c.clips, 'clip', fileFail); uniqueIds(c.titles, 'title', fileFail);
    if (!Array.isArray(request.assets)) fileFail('Native media assets must be an array.');
    uniqueIds(request.assets, 'asset', fileFail);
    const assets = new Map<string, Uint8Array>(), bytes = new Map<string, Uint8Array>();
    for (const asset of request.assets) {
      if (!(asset.bytes instanceof Uint8Array) || !asset.bytes.length) fileFail('A media asset needs nonempty byte data.');
      assets.set(asset.id, asset.bytes);
    }
    for (const m of c.media) {
      checkMedia(m, fileFail);
      const asset = assets.get(`media-${m.id}`); if (!asset) fileFail(`The media for ${m.name} is missing.`); bytes.set(m.id, asset!);
    }
    if (assets.size !== bytes.size) fileFail('The project contains unreferenced media assets.');
    for (const clip of c.clips) checkClip(clip, c.media, fileFail); for (const t of c.titles) checkTitle(t, fileFail);
    return freeze({ width: c.width, height: c.height, fps: 30, media: c.media.map(m => ({ ...m })), clips: c.clips.map(x => ({ ...x })), titles: c.titles.map(x => ({ ...x })), bytes });
  }
  const v = request.value, op = request.op, clips = v.clips.map(c => ({ ...c })), titles = v.titles.map(t => ({ ...t })), media = [...v.media], bytes = new Map(v.bytes);
  let { width, height } = v;
  const find = (id: string) => clips.findIndex(c => c.id === id) >= 0 ? clips.findIndex(c => c.id === id) : editFail('Select a clip first.');
  if (op.kind === 'add-media' || op.kind === 'import-media') {
    const m = op.media; checkMedia(m, editFail); if (media.some(x => x.id === m.id) || !(op.bytes instanceof Uint8Array) || !op.bytes.length) editFail('That media file could not be added.');
    media.push(Object.freeze({ ...m })); bytes.set(m.id, op.bytes.slice());
    if (op.kind === 'add-media') {
      if (!validId(op.clipId) || clips.some(c => c.id === op.clipId)) editFail('Choose a new nonempty clip ID.');
      clips.push({ id: op.clipId, mediaId: m.id, in: 0, out: m.kind === 'image' ? op.imageSeconds ?? 3 : m.duration, fadeIn: 0, fadeOut: 0, volume: 1 });
      if (!v.clips.length) { const scale = Math.min(1, 1920 / m.width, 1080 / m.height); width = Math.max(16, Math.round(m.width * scale / 2) * 2); height = Math.max(16, Math.round(m.height * scale / 2) * 2); }
    }
  } else if (op.kind === 'place-media') {
    const m = media.find(m => m.id === op.mediaId); if (!m || !validId(op.clipId) || clips.some(c => c.id === op.clipId)) editFail('Choose an existing bin item and a new clip ID.');
    clips.push({ id: op.clipId, mediaId: m!.id, in: 0, out: m!.kind === 'image' ? op.imageSeconds ?? 3 : m!.duration, fadeIn: 0, fadeOut: 0, volume: 1 });
  } else if (op.kind === 'remove-media') {
    const index = media.findIndex(m => m.id === op.mediaId); if (index < 0) editFail('Choose an existing bin item.');
    if (clips.some(c => c.mediaId === op.mediaId)) editFail('Remove its timeline clips before removing this bin item.');
    media.splice(index, 1); bytes.delete(op.mediaId);
  } else if (op.kind === 'trim') { const i = find(op.id); clips[i] = { ...clips[i]!, in: op.in, out: op.out }; clips[i]!.fadeIn = Math.min(clips[i]!.fadeIn, (op.out - op.in) / 2); clips[i]!.fadeOut = Math.min(clips[i]!.fadeOut, (op.out - op.in) / 2); }
  else if (op.kind === 'clip') { const i = find(op.id); clips[i] = { ...clips[i]!, ...(op.fadeIn !== undefined ? { fadeIn: op.fadeIn } : {}), ...(op.fadeOut !== undefined ? { fadeOut: op.fadeOut } : {}), ...(op.volume !== undefined ? { volume: op.volume } : {}) }; }
  else if (op.kind === 'split') {
    const located = videoTimeline({ operation: 'locate', value: v, time: op.time });
    if (!located || located.offset < MIN_CLIP || clipLength(located.clip) - located.offset < MIN_CLIP) editFail('Move the playhead inside a clip, at least 0.1 s from its ends, to split it.');
    if (!validId(op.newId) || clips.some(c => c.id === op.newId)) editFail('Choose a new nonempty clip ID.');
    const c = clips[located!.index]!; clips.splice(located!.index, 1, { ...c, out: located!.source, fadeOut: 0 }, { ...c, id: op.newId, in: located!.source, fadeIn: 0 });
  } else if (op.kind === 'move') { const i = find(op.id), [c] = clips.splice(i, 1); clips.splice(Math.max(0, Math.min(clips.length, op.index)), 0, c!); }
  else if (op.kind === 'delete') { clips.splice(find(op.id), 1); }
  else if (op.kind === 'title') { checkTitle(op.title, editFail); const i = titles.findIndex(t => t.id === op.title.id); if (i >= 0) titles[i] = { ...op.title }; else titles.push({ ...op.title }); }
  else if (op.kind === 'delete-title') { const i = titles.findIndex(t => t.id === op.id); if (i < 0) editFail('Select a title first.'); titles.splice(i, 1); }
  else if (op.kind === 'size') { if (![op.width, op.height].every(n => Number.isInteger(n) && n >= 16) || op.width > 3840 || op.height > 2160) editFail('Frame size is 16–3840 by 16–2160 pixels.'); width = op.width; height = op.height; }
  else editFail('Unknown video edit.');
  for (const c of clips) checkClip(c, media, editFail);
  return freeze({ width, height, fps: 30, media, clips, titles, bytes });
}
