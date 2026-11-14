/**
 * PURPOSE    Present accessible audio waveform range selection.
 * KIND       SHELL
 * CONTRACT   IN: live DOM host, selection/command callbacks and A01 document with a half-open selection.
 *            OUT: focusable waveform, pointer range selection, single-frame arrow selection and zoom controls.
 *            RAISES: TypeError for invalid host; A03 waveform errors propagate to the assembly.
 * GUARANTEES Selection never edits PCM; cached extrema are reused while only cursor/selection changes.
 * TUNING     LEFT=48/RIGHT=12 are plot gutters; MIN_ZOOM_FRAMES=32 prevents a visually empty zoom.
 * DECISIONS  D1: Numeric controls remain in the assembly as the precise alternative to canvas gestures.
 *            A canvas-only editor would exclude keyboard/screen-reader users. Revisit if native SVG rendering scales.
 * LIMITS     One view of all channels; no spectrogram. Zoom uses the selection or its midpoint.
 * TESTBENCH  src/audio/audio-waveform.test.ts -- run with: node --import tsx --test src/audio/audio-waveform.test.ts
 */
import type { AudioDocument } from './audio-document.ts';
import { audioSamples } from './audio-samples.ts';
type Selection = { start: number; end: number };
type Request = { root: HTMLElement; selected(range: Selection): void; command(id: string): void };
const LEFT = 48, RIGHT = 12, MIN_ZOOM_FRAMES = 32;
export function createAudioWaveform({ root, selected, command }: Request): {
  update(value: AudioDocument | null, selection: Selection, cursor: number): void;
  zoom(mode: 'in' | 'out' | 'selection' | 'all'): void; focus(): void; dispose(): void;
} {
  if (!root?.ownerDocument.defaultView) throw new TypeError('A live waveform host is required.');
  const document = root.ownerDocument, window = document.defaultView!;
  const group = document.createElement('div'), canvas = document.createElement('canvas');
  group.className = 'audio-waveform'; group.tabIndex = 0; group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Audio waveform range selection');
  group.setAttribute('aria-description', 'Drag to select audio. Left and Right move one frame; Shift extends selection. Home and End move to the beginning and end. Space plays or stops. Use the numeric start and end controls for exact selection.');
  canvas.setAttribute('aria-hidden', 'true'); group.append(canvas); root.append(group);
  const ctx = canvas.getContext('2d');
  let value: AudioDocument | null = null, selection: Selection = { start: 0, end: 0 }, cursor = 0, visibleStart = 0, visibleEnd = 0, anchor = 0, head = 0, pointer: number | null = null;
  let cachedValue: AudioDocument | null = null, cacheKey = '', buckets: { min: number; max: number }[][] = [];
  const x = (frame: number, width: number) => LEFT + (frame - visibleStart) / Math.max(1, visibleEnd - visibleStart) * (width - LEFT - RIGHT);
  function draw() {
    const width = Math.max(320, group.clientWidth), height = Math.max(180, group.clientHeight), dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#f8fbf5'; ctx.fillRect(0, 0, width, height);
    const count = Math.max(1, Math.min(16384, Math.floor(width - LEFT - RIGHT))), key = `${visibleStart}:${visibleEnd}:${count}`;
    if (value && (cachedValue !== value || cacheKey !== key)) { buckets = audioSamples({ operation: 'waveform', value, start: visibleStart, end: visibleEnd, buckets: count }); cachedValue = value; cacheKey = key; }
    if (!value?.frames) { ctx.fillStyle = '#525d61'; ctx.font = '13px Tahoma'; ctx.fillText('Import an audio file to see its waveform.', LEFT, height / 2); return; }
    const top = 24, band = (height - 48) / value.channels;
    ctx.fillStyle = '#d7e9ff'; const a = Math.max(LEFT, x(selection.start, width)), b = Math.min(width - RIGHT, x(selection.end, width)); if (b > a) ctx.fillRect(a, top, b - a, height - 48);
    ctx.font = '11px Tahoma';
    for (let channel = 0; channel < value.channels; channel++) {
      const mid = top + band * (channel + .5), amp = band * .4;
      ctx.strokeStyle = '#cbd7c8'; ctx.beginPath(); ctx.moveTo(LEFT, mid); ctx.lineTo(width - RIGHT, mid); ctx.stroke();
      ctx.fillStyle = '#445345'; ctx.fillText(value.channels === 1 ? 'Mono' : channel ? 'Right' : 'Left', 6, mid + 4);
      const samples = buckets[channel] ?? []; ctx.lineWidth = 1;
      for (let i = 0; i < samples.length; i++) {
        const sample = samples[i]!, px = LEFT + i * (width - LEFT - RIGHT) / samples.length;
        ctx.strokeStyle = sample.min < -1 || sample.max > 1 ? '#b33224' : '#21642c';
        ctx.beginPath(); ctx.moveTo(px, mid - Math.max(-1, Math.min(1, sample.max)) * amp); ctx.lineTo(px, mid - Math.max(-1, Math.min(1, sample.min)) * amp + .5); ctx.stroke();
      }
      if (samples.length < count / 2) {
        ctx.strokeStyle = '#21642c'; ctx.beginPath();
        samples.forEach((sample, i) => { const px = LEFT + i * (width - LEFT - RIGHT) / samples.length, py = mid - Math.max(-1, Math.min(1, sample.max)) * amp; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); ctx.stroke();
      }
    }
    for (let i = 0; i <= 5; i++) {
      const frame = visibleStart + (visibleEnd - visibleStart) * i / 5, px = x(frame, width), precision = (visibleEnd - visibleStart) / value.sampleRate < .01 ? 6 : 3; ctx.fillStyle = '#445345'; ctx.textAlign = i === 5 ? 'right' : 'left'; ctx.fillText(`${(frame / value.sampleRate).toFixed(precision)}s`, px, 15);
    }
    ctx.textAlign = 'left'; ctx.strokeStyle = '#a51b17'; const playX = x(cursor, width);
    if (playX >= LEFT && playX <= width - RIGHT) { ctx.beginPath(); ctx.moveTo(playX, top); ctx.lineTo(playX, height - 20); ctx.stroke(); }
    ctx.fillStyle = '#445345'; ctx.fillText(`Frames ${selection.start}–${selection.end} (end excluded)`, LEFT, height - 6);
  }
  function choose(a: number, b: number) { anchor = a; head = b; selection = { start: Math.min(a, b), end: Math.max(a, b) }; selected(selection); }
  function point(event: PointerEvent) { const rect = canvas.getBoundingClientRect(); return Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left - LEFT) / Math.max(1, rect.width - LEFT - RIGHT))) * (visibleEnd - visibleStart) + visibleStart); }
  canvas.addEventListener('pointerdown', event => { if (event.button || !value?.frames) return; event.preventDefault(); event.stopPropagation(); group.focus(); pointer = event.pointerId; canvas.setPointerCapture(pointer); const frame = point(event); choose(event.shiftKey ? anchor : frame, frame); });
  canvas.addEventListener('pointermove', event => { if (pointer !== event.pointerId) return; event.preventDefault(); event.stopPropagation(); choose(anchor, point(event)); });
  const release = (event: PointerEvent) => { if (pointer !== event.pointerId) return; event.preventDefault(); event.stopPropagation(); if (canvas.hasPointerCapture?.(pointer)) canvas.releasePointerCapture(pointer); pointer = null; };
  canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
  group.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === ' ') { event.preventDefault(); event.stopPropagation(); command('audio.togglePlayback'); return; }
    if (!value || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? value.frames : Math.max(0, Math.min(value.frames, head + (event.key === 'ArrowLeft' ? -1 : 1)));
    choose(event.shiftKey ? anchor : next, next);
  });
  const observer = typeof window.ResizeObserver === 'function' ? new window.ResizeObserver(draw) : null; observer?.observe(group); window.addEventListener('resize', draw);
  return {
    update(next, range, frame) {
      if (selection.start !== range.start || selection.end !== range.end) { anchor = range.start; head = range.end; }
      if (next !== value) {
        if (!value || visibleEnd === value.frames) { visibleStart = 0; visibleEnd = next?.frames ?? 0; }
        else { visibleEnd = Math.min(visibleEnd, next?.frames ?? 0); visibleStart = Math.min(visibleStart, Math.max(0, visibleEnd - 1)); }
      }
      value = next; selection = { ...range }; cursor = frame; group.dataset.start = String(range.start); group.dataset.end = String(range.end);
      group.setAttribute('aria-label', `Audio waveform range selection, frames ${range.start} to ${range.end}, end excluded`); draw();
    },
    zoom(mode) {
      if (!value?.frames) return;
      if (mode === 'all') { visibleStart = 0; visibleEnd = value.frames; }
      else {
        const middle = (selection.start + selection.end) / 2, length = Math.min(value.frames, Math.max(MIN_ZOOM_FRAMES, mode === 'selection' ? selection.end - selection.start : (visibleEnd - visibleStart) * (mode === 'in' ? .5 : 2)));
        visibleStart = Math.max(0, Math.min(value.frames - length, Math.floor(middle - length / 2))); visibleEnd = Math.min(value.frames, Math.ceil(visibleStart + length));
      }
      draw();
    },
    focus() { group.focus(); }, dispose() { observer?.disconnect(); window.removeEventListener('resize', draw); group.remove(); },
  };
}
