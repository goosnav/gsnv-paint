/**
 * PURPOSE    Connect the basic Video editor (sequence of clips, titles, export) to the shared application.
 * KIND       SHELL assembly VIDEO-APP; media elements, canvas preview, Web Audio routing and MediaRecorder export.
 * CONTRACT   IN: S07 file ports and browser media APIs. OUT: WorkspaceAdapter for gsnv-video. Timeline decisions
 *            belong to video-timeline.ts. Each import, trim, split, move, fade, volume, title or delete commits one
 *            history entry; playback and scrubbing never do.
 *            RAISES: invalid project content from decode; playback/export failures show in the hint.
 * GUARANTEES Original media bytes are stored unchanged in the project; object URLs are revoked on dispose.
 *            Inspector refresh preserves semantic control focus or returns it to the timeline; outside focus stays owned by its caller.
 * TUNING     PIXELS_PER_SECOND, STEP and export MIME preference below.
 * DECISIONS  D1: Export renders the canvas in real time through MediaRecorder (WebM, or MP4 where the browser can
 *            record it). Alternative: frame-exact WebCodecs muxing; deferred because it needs a muxer dependency.
 * LIMITS     Real-time export (a 1-minute video takes a minute); one sequence track plus titles; Chrome-tested.
 * TESTBENCH  src/video/video-workspace.browser.spec.ts -- run with: npm run test:browser -- src/video/video-workspace.browser.spec.ts
 */
import type { WorkspaceAdapter } from '../app/app-shell.ts';
import { fileAccess, type FilePorts } from '../shared/file-access.ts';
import { videoTimeline, duration, starts, clipLength, type VideoContent, type VideoOp, type Media, type Title } from './video-timeline.ts';
import { renderVideoFrame } from './video-frame-renderer.ts';
import { videoMediaBin } from './video-media-bin.ts';
import { videoFieldEdit } from './video-field-edit.ts';
import { videoSource } from '../bridge/video-source-adapter.ts';
import type { EditorBridge } from '../bridge/workspace-bridge.ts';
import './video-workspace.css';

type Snapshot = Parameters<ReturnType<WorkspaceAdapter['mount']>['render']>[0];
type Element = { url: string; el: HTMLVideoElement | HTMLImageElement; gain?: GainNode };
const PIXELS_PER_SECOND = 60, STEP = 1 / 30;
const MEDIA_TYPES = { 'video/*': ['.mp4', '.webm', '.mov', '.m4v', '.ogv'], 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'] };
const EXPORT_TYPES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
const clock = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(1).padStart(4, '0')}`;

export function createVideoWorkspace(files: FilePorts): WorkspaceAdapter {
  return {
    create: () => ({ id: crypto.randomUUID(), title: 'Untitled video', format: 'gsnv-video', version: 1, value: videoTimeline({ operation: 'new' }) }),
    decode(packageValue) {
      const p = packageValue.project; if (p.format !== 'gsnv-video') throw new Error('This is not a gsnv-video project.');
      return { id: p.id, title: p.title, format: p.format, version: p.version, value: videoTimeline({ operation: 'decode', content: p.content, assets: packageValue.assets }) };
    },
    encode(document) { const e = videoTimeline({ operation: 'encode', value: document.value as VideoContent }); return { project: { format: 'gsnv-video', version: 1, id: document.id, title: document.title, content: e.content }, assets: e.assets }; },
    mount(host) {
      const document = host.root.ownerDocument, window = document.defaultView!;
      const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => { const n = document.createElement(tag); if (className) n.className = className; if (text) n.textContent = text; return n; };
      const stage = make('div', 'video-stage'), monitor = make('div', 'video-monitor'), canvas = make('canvas', 'video-canvas'), transport = make('div', 'video-transport');
      const play = make('button', 'xp-button video-play', 'Play'), home = make('button', 'xp-button', '|◀'), time = make('span', 'video-time', '00:00.0 / 00:00.0'), scrub = make('input', 'xp-range video-scrub');
      const timeline = make('div', 'video-timeline'), ruler = make('div', 'video-ruler'), track = make('div', 'video-track'), titleTrack = make('div', 'video-titletrack'), playhead = make('div', 'video-playhead');
      const empty = make('div', 'video-empty'), addButton = make('button', 'xp-button', 'Add video or image…'), hint = make('div', 'video-hint'), panel = make('div', 'video-panel');
      play.type = home.type = addButton.type = 'button'; home.setAttribute('aria-label', 'Go to start'); play.setAttribute('aria-label', 'Play or pause (Space)');
      scrub.type = 'range'; scrub.min = '0'; scrub.step = '0.01'; scrub.setAttribute('aria-label', 'Playhead position');
      canvas.setAttribute('aria-label', 'Video preview'); stage.tabIndex = -1; timeline.tabIndex = 0; timeline.setAttribute('aria-label', 'Timeline');
      empty.append(make('h2', '', 'Edit a video'), make('p', '', 'Add video clips or images, trim and split them on the timeline, add titles and fades, then export a video file.'), addButton);
      monitor.append(canvas, empty, hint); transport.append(home, play, time, scrub); timeline.append(ruler, track, titleTrack, playhead); stage.append(monitor, transport, timeline); host.root.append(stage);
      const ctx = canvas.getContext('2d');
      let current: Snapshot, content: VideoContent | null = null, selected: string | null = null, t = 0, playing = false, startClock = 0, startT = 0, raf = 0, active: HTMLVideoElement | null = null, message = '', disposed = false;
      let audio: AudioContext | null = null, recordDest: MediaStreamAudioDestinationNode | null = null, exporting: { recorder: MediaRecorder; chunks: Blob[] } | null = null;
      const elements = new Map<string, Element>();
      let pendingImports = 0, rangeScrubbing = false, pendingField: { clipId: string; field: string; value: string } | null = null;
      const binRoot = make('div'), bin = videoMediaBin({ root: binRoot, action(kind, mediaId) { try { flush(); commit(kind === 'place' ? { kind: 'place-media', mediaId, clipId: crypto.randomUUID() } : { kind: 'remove-media', mediaId }, kind === 'place' ? 'Add bin item to timeline' : 'Remove bin item'); } catch (cause) { hint.textContent = String(cause); } } });

      function syncMedia() {
        if (!content) return;
        for (const m of content.media) if (!elements.has(m.id)) {
          const url = URL.createObjectURL(new Blob([content.bytes.get(m.id)!.slice()], { type: m.mime }));
          const el = m.kind === 'video' ? Object.assign(make('video'), { src: url, preload: 'auto', playsInline: true, crossOrigin: 'anonymous' }) : Object.assign(new Image(), { src: url });
          if (el instanceof HTMLVideoElement) el.addEventListener('seeked', () => { if (!playing) draw(); });
          else el.addEventListener('load', () => draw());
          elements.set(m.id, { url, el });
        }
        for (const [id, e] of elements) if (!content.media.some(m => m.id === id)) { e.el instanceof HTMLVideoElement && e.el.pause(); URL.revokeObjectURL(e.url); elements.delete(id); }
      }
      function ensureAudio() {
        if (audio || !content) { void audio?.resume(); return; }
        audio = new AudioContext(); recordDest = audio.createMediaStreamDestination();
      }
      function route(e: Element) {
        if (!audio || e.gain || !(e.el instanceof HTMLVideoElement)) return;
        const source = audio.createMediaElementSource(e.el), gain = audio.createGain(); source.connect(gain); gain.connect(audio.destination); gain.connect(recordDest!); e.gain = gain;
      }
      function draw() {
        if (!ctx || !content) return;
        renderVideoFrame(ctx, content, t, id => elements.get(id)?.el);
        const at = videoTimeline({ operation: 'locate', value: content, time: t }), element = at && elements.get(at.media.id);
        if (element?.gain) element.gain.gain.value = at!.clip.volume * at!.fade;
      }
      function seekTo(time: number) {
        if (!content) return; t = Math.max(0, Math.min(duration(content), time));
        if (playing) { startT = t; startClock = performance.now(); active?.pause(); active = null; }
        else { const at = videoTimeline({ operation: 'locate', value: content, time: t }), el = at && elements.get(at.media.id)?.el; if (el instanceof HTMLVideoElement && el.currentTime !== at!.source) el.currentTime = at!.source; else draw(); }
        refreshTime();
      }
      function tick() {
        if (!playing || !content) return;
        t = startT + (performance.now() - startClock) / 1000;
        if (t >= duration(content)) { t = duration(content); stop(); seekTo(t); if (exporting) finishExport(); refreshTime(); return; }
        const at = videoTimeline({ operation: 'locate', value: content, time: t }), e = at && elements.get(at.media.id), el = e?.el;
        if (el instanceof HTMLVideoElement) {
          route(e!);
          if (active !== el) { active?.pause(); active = el; el.currentTime = at!.source; void el.play().catch(() => {}); }
          else if (Math.abs(el.currentTime - at!.source) > 0.3) el.currentTime = at!.source;
        } else if (active) { active.pause(); active = null; }
        draw(); refreshTime(); raf = window.requestAnimationFrame(tick);
      }
      function start() { if (!content || !content.clips.length) return; ensureAudio(); if (t >= duration(content) - 0.01) t = 0; playing = true; startT = t; startClock = performance.now(); raf = window.requestAnimationFrame(tick); refresh(); }
      function stop() { playing = false; window.cancelAnimationFrame(raf); active?.pause(); active = null; refresh(); }
      function refreshTime() {
        const total = content ? duration(content) : 0; time.textContent = `${clock(t)} / ${clock(total)}`; scrub.max = String(total);
        if (document.activeElement !== scrub) scrub.value = String(t); playhead.style.left = `${t * PIXELS_PER_SECOND}px`;
      }
      function commit(op: VideoOp, label: string) {
        if (!content || !current) return;
        try { const value = videoTimeline({ operation: 'edit', value: content, op }); message = ''; host.commit({ ...current, value }, label, current.identity); }
        catch (cause) { message = cause instanceof Error ? cause.message : String(cause); refresh(); }
      }
      async function probe(file: { name: string; bytes: Uint8Array; mime: string }): Promise<Media> {
        const url = URL.createObjectURL(new Blob([file.bytes.slice()], { type: file.mime }));
        try {
          if (file.mime.startsWith('image/')) { const img = new Image(); img.src = url; await img.decode(); return { id: crypto.randomUUID(), name: file.name, mime: file.mime, kind: 'image', duration: 1, width: img.naturalWidth, height: img.naturalHeight }; }
          const v = make('video'); v.preload = 'metadata'; v.muted = true; v.src = url;
          await new Promise<void>((resolve, reject) => { v.onloadedmetadata = () => resolve(); v.onerror = () => reject(new Error('This browser cannot play that video format.')); });
          if (!Number.isFinite(v.duration)) { v.currentTime = 1e101; await new Promise<void>(resolve => { v.ondurationchange = () => { if (Number.isFinite(v.duration)) resolve(); }; setTimeout(resolve, 3000); }); }
          if (!Number.isFinite(v.duration) || v.duration <= 0) throw new Error('The video length could not be read.');
          return { id: crypto.randomUUID(), name: file.name, mime: file.mime, kind: 'video', duration: Math.floor(v.duration * 1000) / 1000, width: v.videoWidth, height: v.videoHeight };
        } finally { URL.revokeObjectURL(url); }
      }
      async function addMedia(file?: File) {
        const base = current?.identity; pendingImports++; host.invalidate();
        try {
        let name: string, bytes: Uint8Array, mime: string;
        if (file) { name = file.name; bytes = new Uint8Array(await file.arrayBuffer()); mime = file.type; }
        else {
          const result = await fileAccess({ op: 'open', accept: MEDIA_TYPES }, files); if (disposed || 'cancelled' in result) return;
          if (!result.ok) { message = `${result.error.code}: ${result.error.message}`; refresh(); return; }
          name = result.value.name; const parts = result.value.bytes; bytes = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts) { bytes.set(p, o); o += p.length; }
          const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase(); mime = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', ogv: 'video/ogg', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[ext] ?? 'video/mp4';
        }
        try {
          message = `Reading ${name}…`; refresh(); const media = await probe({ name, bytes, mime });
          if (disposed) return;
          if (base !== current?.identity) throw new Error('The Video project changed while reading media. Add it again to the current project.');
          if (!current && !await host.open({ id: crypto.randomUUID(), title: name.replace(/\.[^.]+$/, ''), format: 'gsnv-video', version: 1, value: videoTimeline({ operation: 'new' }) })) return;
          commit({ kind: 'add-media', media, bytes, clipId: crypto.randomUUID() }, `Add ${media.kind}`);
        } catch (cause) { message = `${name}: ${cause instanceof Error ? cause.message : String(cause)}`; refresh(); }
        } catch (cause) { message = cause instanceof Error ? cause.message : String(cause); refresh(); } finally { pendingImports--; host.invalidate(); }
      }
      function titleDialog(existing?: Title) {
        if (!content) return;
        host.dialog({ title: existing ? 'Edit title' : 'Add title', fields: [{ key: 'text', label: 'Text', type: 'text', multiline: true }, { key: 'start', label: 'Start (s)', type: 'number', min: 0, step: 0.1 }, { key: 'duration', label: 'Duration (s)', type: 'number', min: 0.1, step: 0.1 },
          { key: 'size', label: 'Size', type: 'number', min: 8, max: 400, step: 1 }, { key: 'color', label: 'Colour (#rrggbb)', type: 'text' }, { key: 'position', label: 'Position', type: 'select', choices: [{ value: 'top', label: 'Top' }, { value: 'middle', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }] }, { key: 'background', label: 'Dark box behind text', type: 'checkbox' }],
          initial: existing ? { ...existing } : { text: '', start: Math.round(t * 10) / 10, duration: 3, size: 56, color: '#ffffff', position: 'bottom', background: true },
          validate: v => String(v.text).trim() ? { ok: true, value: v } : { ok: false, error: { code: 'video.title', message: 'Type the title text.' } }, preview() {}, cancel() {},
          commit: v => { const x = v as Record<string, unknown>; commit({ kind: 'title', title: { id: existing?.id ?? crypto.randomUUID(), text: String(x.text), start: Number(x.start), duration: Number(x.duration), size: Number(x.size), color: String(x.color), position: x.position as Title['position'], background: !!x.background } }, existing ? 'Edit title' : 'Add title'); } });
      }
      function exportVideo() {
        if (!content || !content.clips.length || exporting) return;
        const type = EXPORT_TYPES.find(m => MediaRecorder.isTypeSupported(m)); if (!type) { message = 'This browser cannot record video.'; refresh(); return; }
        ensureAudio(); for (const e of elements.values()) route(e);
        const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...(recordDest?.stream.getAudioTracks() ?? [])]);
        const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 }), chunks: Blob[] = [];
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        exporting = { recorder, chunks }; stage.setAttribute('aria-busy', 'true'); recorder.start(500); t = 0; message = `Exporting in real time (${clock(duration(content))})…`; start();
      }
      function finishExport() {
        const job = exporting; if (!job || !current) return; exporting = null;
        job.recorder.onstop = async () => {
          stage.removeAttribute('aria-busy');
          const type = job.recorder.mimeType, blob = new Blob(job.chunks, { type }), bytes = new Uint8Array(await blob.arrayBuffer()), ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
          const saved = await fileAccess({ op: 'save', name: `${current!.title.trim() || 'video'}.${ext}`, mime: type.split(';')[0]!, bytes }, files);
          if ('cancelled' in saved) return; message = saved.ok ? `Exported ${saved.value.name}.` : `${saved.error.code}: ${saved.error.message}`; refresh(); host.invalidate();
        };
        job.recorder.stop();
      }
      function renderTimeline() {
        track.replaceChildren(); titleTrack.replaceChildren(); ruler.replaceChildren(); if (!content) return;
        const total = duration(content), width = Math.max(timeline.clientWidth, (total + 5) * PIXELS_PER_SECOND);
        for (const el of [ruler, track, titleTrack]) el.style.width = `${width}px`;
        for (let s = 0; s * PIXELS_PER_SECOND < width; s++) { const tick = make('span', 'video-tick', s % 5 === 0 ? clock(s).slice(0, 5) : ''); tick.style.left = `${s * PIXELS_PER_SECOND}px`; if (s % 5 === 0) tick.dataset.major = ''; ruler.append(tick); }
        const at = starts(content);
        content.clips.forEach((c, i) => {
          const media = content!.media.find(m => m.id === c.mediaId)!, block = make('div', 'video-clip'); block.dataset.clipId = c.id;
          block.style.left = `${at[i]! * PIXELS_PER_SECOND}px`; block.style.width = `${Math.max(4, clipLength(c) * PIXELS_PER_SECOND - 2)}px`; block.dataset.kind = media.kind;
          block.setAttribute('aria-pressed', String(c.id === selected)); block.title = `${media.name} · ${clockLen(clipLength(c))}`; block.append(make('span', '', media.name), make('small', '', clockLen(clipLength(c)))); track.append(block);
        });
        for (const title of content.titles) { const b = make('div', 'video-title-block', title.text.split('\n')[0]); b.dataset.titleId = title.id; b.style.left = `${title.start * PIXELS_PER_SECOND}px`; b.style.width = `${Math.max(4, title.duration * PIXELS_PER_SECOND - 2)}px`; titleTrack.append(b); }
      }
      const clockLen = (s: number) => `${s.toFixed(1)} s`;
      function renderPanel() {
        const identity = (node: HTMLElement) => JSON.stringify([node.tagName, (node as HTMLInputElement).type, node.dataset.field, node.dataset.clipId, node.dataset.videoCommand, node.dataset.editTitle, node.dataset.deleteTitle]);
        const focused = document.activeElement as HTMLElement | null, restore = focused && panel.contains(focused) ? identity(focused) : null;
        panel.replaceChildren(); panel.className = 'video-panel';
        const section = (title: string) => { panel.append(make('h3', '', title)); };
        const clip = content?.clips.find(c => c.id === selected), media = clip && content!.media.find(m => m.id === clip.mediaId);
        section(clip ? `Clip: ${media!.name}` : 'Clip');
        if (!clip) panel.append(make('p', 'video-none', content?.clips.length ? 'Click a clip on the timeline to edit it.' : 'Add a video or image to start.'));
        else {
          const row = (label: string, key: 'in' | 'out' | 'fadeIn' | 'fadeOut', max: number) => { const r = make('label', 'video-row'), box = make('input', 'xp-field'); box.type = 'number'; box.step = '0.1'; box.min = '0'; box.max = String(max); box.value = String(Math.round(clip[key] * 100) / 100); box.dataset.field = key; box.dataset.clipId = clip.id; r.append(make('span', '', label), box); panel.append(r); };
          row('In (s)', 'in', media!.kind === 'video' ? media!.duration : 3600); row('Out (s)', 'out', media!.kind === 'video' ? media!.duration : 3600); row('Fade in (s)', 'fadeIn', clipLength(clip)); row('Fade out (s)', 'fadeOut', clipLength(clip));
          const vol = make('div', 'video-row'), range = make('input', 'xp-range'), box = make('input', 'xp-field');
          range.type = 'range'; box.type = 'number'; for (const n of [range, box]) { n.min = '0'; n.max = '200'; n.step = '1'; n.value = String(Math.round(clip.volume * 100)); n.dataset.field = 'volume'; n.dataset.clipId = clip.id; } box.setAttribute('aria-label', 'Volume (%)');
          vol.append(make('span', '', 'Volume (%)'), range, box); panel.append(vol);
          const buttons = make('div', 'video-buttons');
          for (const [id, label] of [['video.moveEarlier', '◀ Earlier'], ['video.moveLater', 'Later ▶'], ['video.split', 'Split at playhead'], ['edit.delete', 'Delete clip']]) { const b = make('button', 'xp-button', label); b.type = 'button'; b.dataset.videoCommand = id!; b.dataset.clipId = clip.id; buttons.append(b); }
          panel.append(buttons);
        }
        section('Titles');
        for (const title of content?.titles ?? []) { const r = make('div', 'video-title-row'), edit = make('button', 'xp-button', 'Edit'), del = make('button', 'xp-button', 'Delete'); edit.type = del.type = 'button'; edit.dataset.editTitle = title.id; del.dataset.deleteTitle = title.id; r.append(make('span', '', `${title.text.split('\n')[0]} · ${title.start}s`), edit, del); panel.append(r); }
        const add = make('button', 'xp-button', 'Add title…'); add.type = 'button'; add.dataset.videoCommand = 'video.addTitle'; add.disabled = !content?.clips.length; panel.append(add);
        section('Export');
        const exp = make('button', 'xp-button', exporting ? 'Exporting…' : 'Export video…'); exp.type = 'button'; exp.dataset.videoCommand = 'video.export'; exp.disabled = !content?.clips.length || !!exporting; panel.append(exp, make('p', 'video-none', `${content?.width ?? 0} × ${content?.height ?? 0} px, 30 fps. Export plays the video once in real time.`));
        if (pendingField?.clipId === selected) for (const input of panel.querySelectorAll<HTMLInputElement>('[data-field]')) if (input.dataset.field === pendingField.field) input.value = pendingField.value;
        if (restore !== null && !disposed) {
          const replacement = [...panel.querySelectorAll<HTMLElement>('button,input')].find(node => identity(node) === restore && !node.matches(':disabled'));
          (replacement ?? timeline).focus({ preventScroll: true });
        }
      }
      function fit() {
        if (!content) return; const box = monitor.getBoundingClientRect(), s = Math.min((box.width - 24) / content.width, (box.height - 24) / content.height);
        if (s > 0) { canvas.style.width = `${Math.floor(content.width * s)}px`; canvas.style.height = `${Math.floor(content.height * s)}px`; }
      }
      const resize = new ResizeObserver(() => fit()); resize.observe(monitor);
      function refresh() {
        if (disposed) return; fit();
        empty.hidden = !!content?.clips.length; play.textContent = playing ? 'Pause' : 'Play'; play.disabled = !content?.clips.length || !!exporting; home.disabled = play.disabled;
        hint.textContent = message || (content?.clips.length ? 'Space plays · S splits at the playhead · I/O set the clip in/out · ←/→ step a frame.' : 'Add a video or image to start.'); hint.hidden = !current && !message;
        renderTimeline(); renderPanel(); refreshTime(); if (!playing) draw();
        bin.update(content, id => elements.get(id)?.url);
      }
      function flush() {
        if (!pendingField || !content || !current) return;
        const edit = videoFieldEdit(content, pendingField.clipId, pendingField.field, pendingField.value); pendingField = null;
        host.commit({ ...current, value: edit.value }, edit.label, current.identity);
      }
      // Panel and timeline interactions.
      const onPanel = (event: Event) => {
        const target = event.target as HTMLElement & { value?: string }, clip = content?.clips.find(c => c.id === selected);
        const command = target.closest<HTMLElement>('[data-video-command]')?.dataset.videoCommand; if (command && event.type === 'click') { run(command); return; }
        const editTitle = target.closest<HTMLElement>('[data-edit-title]')?.dataset.editTitle, deleteTitle = target.closest<HTMLElement>('[data-delete-title]')?.dataset.deleteTitle;
        if (editTitle && event.type === 'click') { titleDialog(content!.titles.find(x => x.id === editTitle)); return; }
        if (deleteTitle && event.type === 'click') { commit({ kind: 'delete-title', id: deleteTitle }, 'Delete title'); return; }
        const field = target.dataset?.field; if (!field || !clip || event.type !== 'change') return;
        pendingField = { clipId: clip.id, field, value: target.value ?? '' };
        try { flush(); } catch (cause) { message = cause instanceof Error ? cause.message : String(cause); hint.textContent = message; hint.hidden = false; }
      };
      const onFieldInput = (event: Event) => { const input = event.target as HTMLInputElement; if (input.dataset.field && selected) pendingField = { clipId: selected, field: input.dataset.field, value: input.value }; };
      panel.addEventListener('click', onPanel); panel.addEventListener('change', onPanel);
      panel.addEventListener('input', onFieldInput);
      // Pointer handling stays local (preventDefault) so the shell's canvas gestures never capture the timeline.
      const timeAt = (event: MouseEvent) => (event.clientX - timeline.getBoundingClientRect().left + timeline.scrollLeft) / PIXELS_PER_SECOND;
      let scrubbing = -1;
      const onTimeline = (event: PointerEvent) => {
        if (!content || event.button !== 0) return; event.preventDefault(); timeline.focus({ preventScroll: true });
        const clip = (event.target as HTMLElement).closest<HTMLElement>('[data-clip-id]'); if (clip) selected = clip.dataset.clipId!;
        scrubbing = event.pointerId; timeline.setPointerCapture(event.pointerId); seekTo(timeAt(event)); refresh(); host.invalidate();
      };
      const onScrub = (event: PointerEvent) => { if (event.pointerId === scrubbing) seekTo(timeAt(event)); };
      const onScrubEnd = (event: PointerEvent) => { if (event.pointerId === scrubbing) { scrubbing = -1; host.invalidate(); } };
      const onTitleOpen = (event: MouseEvent) => { const title = (event.target as HTMLElement).closest<HTMLElement>('[data-title-id]'); if (title && content) titleDialog(content.titles.find(x => x.id === title.dataset.titleId)); };
      timeline.addEventListener('pointerdown', onTimeline); timeline.addEventListener('pointermove', onScrub); timeline.addEventListener('pointerup', onScrubEnd); timeline.addEventListener('pointercancel', onScrubEnd); timeline.addEventListener('dblclick', onTitleOpen);
      scrub.addEventListener('input', () => seekTo(Number(scrub.value)));
      scrub.addEventListener('pointerdown', () => { rangeScrubbing = true; }); for (const type of ['pointerup','pointercancel','blur']) scrub.addEventListener(type, () => { rangeScrubbing = false; host.invalidate(); });
      play.addEventListener('click', () => run('video.togglePlayback')); home.addEventListener('click', () => run('video.home')); addButton.addEventListener('click', () => { void addMedia(); });
      const drop = (event: DragEvent) => { event.preventDefault(); const f = event.dataTransfer?.files[0]; if (f) void addMedia(f); };
      const over = (event: DragEvent) => event.preventDefault();
      stage.addEventListener('drop', drop); stage.addEventListener('dragover', over);
      function run(id: string) {
        const clip = content?.clips.find(c => c.id === selected);
        if (id === 'video.add') { void addMedia(); return; }
        if (!content) return;
        message = '';
        if (id === 'bridge.videoFrameToImage') { void host.transfer?.({ route: 'video-frame-to-image' }); return; }
        if (id === 'tool.cancel' && pendingField) { pendingField = null; refresh(); return; }
        if (id === 'video.togglePlayback') { playing ? stop() : start(); return; }
        if (id === 'video.pause' || id === 'tool.cancel') { if (playing) stop(); return; }
        if (id === 'video.home') { seekTo(0); return; }
        if (id === 'video.end') { seekTo(duration(content)); return; }
        if (id === 'video.stepBack' || id === 'video.stepForward') { seekTo(t + (id === 'video.stepBack' ? -STEP : STEP)); return; }
        if (id === 'video.shuttleReverse' || id === 'video.shuttleForward') { seekTo(t + (id === 'video.shuttleReverse' ? -1 : 1)); return; }
        if (id === 'video.split') { commit({ kind: 'split', time: t, newId: crypto.randomUUID() }, 'Split'); return; }
        if (id === 'video.addTitle') { titleDialog(); return; }
        if (id === 'video.export') { exportVideo(); return; }
        if (!clip) { if (['edit.delete', 'video.markIn', 'video.markOut', 'video.moveEarlier', 'video.moveLater'].includes(id)) { message = 'Click a clip on the timeline first.'; refresh(); } return; }
        const i = content.clips.indexOf(clip), offset = t - starts(content)[i]!;
        if (id === 'edit.delete') { commit({ kind: 'delete', id: clip.id }, 'Delete clip'); selected = null; }
        else if (id === 'video.moveEarlier' || id === 'video.moveLater') commit({ kind: 'move', id: clip.id, index: i + (id === 'video.moveEarlier' ? -1 : 1) }, 'Move clip');
        else if (id === 'video.markIn' || id === 'video.markOut') {
          if (offset < 0 || offset > clipLength(clip)) { message = 'Put the playhead inside the selected clip first.'; refresh(); return; }
          commit({ kind: 'trim', id: clip.id, in: id === 'video.markIn' ? clip.in + offset : clip.in, out: id === 'video.markOut' ? clip.in + offset : clip.out }, id === 'video.markIn' ? 'Set in point' : 'Set out point');
        } else if (id === 'video.size') {
          host.dialog({ title: 'Frame size', fields: [{ key: 'width', label: 'Width (px)', type: 'number', min: 16, max: 3840, step: 2 }, { key: 'height', label: 'Height (px)', type: 'number', min: 16, max: 2160, step: 2 }], initial: { width: content.width, height: content.height }, validate: v => ({ ok: true, value: v }), preview() {}, cancel() {}, commit: v => { const x = v as Record<string, unknown>; commit({ kind: 'size', width: Number(x.width), height: Number(x.height) }, 'Frame size'); } });
        }
      }
      const pendingTransfer = () => disposed ? 'closed workspace' : pendingImports ? 'media import' : exporting ? 'video export' : scrubbing !== -1 || rangeScrubbing ? 'playhead gesture' : pendingField ? 'clip field edit' : '';
      const bridge: EditorBridge = {
        prepare(role) { const pending = pendingTransfer(); if (pending) throw Object.assign(new Error(`Finish or cancel the ${pending} before sending or receiving Video media.`), { name: 'BridgePendingEdit' }); if (role === 'source' && !content?.clips.length) throw Object.assign(new Error('Add a decodable timeline clip before sending a frame.'), { name: 'BridgeUnavailable' }); if (playing) stop(); },
        revision: () => `${current?.identity ?? 'empty'}:${t}:${playing}:${pendingTransfer()}`,
        async capture(intent, source, signal) {
          if (intent.route !== 'video-frame-to-image' || source.workspace !== 'video' || !current || !content) throw new Error('Video can send only the current timeline frame to Image.');
          return videoSource({ document, value: content, time: t, source, label: `${current.title} frame`, signal, isCurrent: () => !disposed && current?.identity === source.identity && bridge.revision() === source.viewRevision });
        },
      };
      return {
        bridge, flush,
        render(snapshot) {
          const changed = snapshot?.identity !== current?.identity; current = snapshot;
          if (changed) { content = snapshot ? snapshot.value as VideoContent : null; if (selected && !content?.clips.some(c => c.id === selected)) selected = content?.clips.at(-1)?.id ?? null; if (!selected && content?.clips.length) selected = content.clips[content.clips.length - 1]!.id; syncMedia(); if (content && t > duration(content)) t = duration(content); }
          refresh();
        },
        model() {
          const enabled = !!content?.clips.length, item = (id: string, label: string, shortcut = '', on = enabled, icon?: string, toolbar = false) => ({ id, label, shortcut, enabled: on, ...(icon ? { icon } : {}), ...(toolbar ? { toolbar } : {}) });
          return { menus: [{ id: 'video', label: 'Video', items: [item('video.add', 'Add video or image…', '', !exporting, 'open', true), item('video.togglePlayback', playing ? 'Pause' : 'Play', 'Space', enabled, 'play', true), item('video.split', 'Split at playhead', 'S', enabled, 'split', true),
            item('edit.delete', 'Delete clip', 'Delete', enabled && !!selected, 'delete'), item('video.markIn', 'Set clip in point', 'I', enabled && !!selected), item('video.markOut', 'Set clip out point', 'O', enabled && !!selected), item('video.moveEarlier', 'Move clip earlier', '', enabled && !!selected), item('video.moveLater', 'Move clip later', '', enabled && !!selected),
            item('video.home', 'Go to start', 'Home'), item('video.end', 'Go to end', 'End'), item('video.stepBack', 'Step back', '←'), item('video.stepForward', 'Step forward', '→'), item('video.shuttleReverse', 'Back 1 second', 'J'), item('video.pause', 'Pause', 'K'), item('video.shuttleForward', 'Forward 1 second', 'L'),
            item('video.addTitle', 'Add title…', '', enabled, 'text', true), item('video.size', 'Frame size…', '', !!content), item('bridge.videoFrameToImage', 'Send current frame to Image', '', enabled && !!host.transfer && !pendingTransfer(), 'image'), item('video.export', 'Export video…', '', enabled && !exporting, 'export', true)] }],
            tools: [], panels: [{ id: 'video-bin', title: 'Media bin', content: binRoot }, { id: 'video-inspector', title: 'Clip, titles and export', content: panel }] };
        },
        context: () => ({ viewRole: 'timeline', activeTool: 'timeline', status: hint.textContent ?? '' }),
        command(id) { run(id); host.invalidate(); },
        gesture() {},
        dispose() { if (disposed) return; disposed = true; resize.disconnect(); stop(); exporting?.recorder.state === 'recording' && exporting.recorder.stop(); for (const e of elements.values()) { e.el instanceof HTMLVideoElement && e.el.pause(); URL.revokeObjectURL(e.url); } void audio?.close(); panel.removeEventListener('click', onPanel); panel.removeEventListener('change', onPanel); panel.removeEventListener('input', onFieldInput); bin.dispose(); host.root.replaceChildren(); },
      };
    },
  };
}
