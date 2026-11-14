/**
 * PURPOSE    Assemble a local waveform editor in the shared application.
 * KIND       SHELL
 * CONTRACT   IN: shared file ports and workspace host; OUT: editable gsnv-audio projects, numeric/pointer selection,
 *            shared-history commands, local playback and PCM16 WAV downloads. Imports decode at 48kHz.
 *            RAISES: invalid native audio from A01; operational failures remain visible and retain the current document.
 * GUARANTEES No remote content, uploads or auto-play on import/open; async import is bound to its original revision.
 * TUNING     IMPORT_RATE=48000, MAX_IMPORT_BYTES=128MiB, MAX_PCM_BYTES=256MiB.
 * DECISIONS  D1: Browser Web Audio decoding supports the installed codecs. Alternative: bundled codec engines would
 *            enlarge the offline payload. Revisit if a required input format is unsupported in supported browsers.
 * LIMITS     Browser codec availability varies; imported audio is resampled to 48kHz. One mono/stereo recording,
 *            no composition. Native projects preserve their stored sample rate. Fallback downloads are handoffs.
 * TESTBENCH  src/audio/audio-workspace.browser.spec.ts -- run with: npx playwright test -c src/audio/audio-playwright.config.ts
 */
import type { WorkspaceAdapter } from '../app/app-shell.ts';
import { fileAccess, type FilePorts } from '../shared/file-access.ts';
import { audioDocument, type AudioDocument } from './audio-document.ts';
import { audioEdits, type AudioEditRequest } from './audio-edits.ts';
import { audioSamples } from './audio-samples.ts';
import { createAudioPlayback } from './audio-playback.ts';
import { createAudioWaveform } from './audio-waveform.ts';
import './audio-workspace.css';
type Snapshot = Parameters<ReturnType<WorkspaceAdapter['mount']>['render']>[0];
const IMPORT_RATE = 48000, MAX_IMPORT_BYTES = 128 * 1024 * 1024, MAX_PCM_BYTES = 256 * 1024 * 1024;
const labels: Record<string, string> = { cut: 'Cut audio', copy: 'Copy audio', paste: 'Paste audio', delete: 'Delete audio', trim: 'Trim to selection', fadeIn: 'Fade in', fadeOut: 'Fade out', gain: 'Volume', normalize: 'Normalize' };
const reason = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);
const blank = (value = audioDocument({ operation: 'new' }), title = 'Untitled audio') => ({ id: crypto.randomUUID(), title, format: 'gsnv-audio', version: 1, value });
export function createAudioWorkspace(files: FilePorts): WorkspaceAdapter {
  return {
    create: () => blank(),
    decode(pkg) { const p = pkg.project; if (p.format !== 'gsnv-audio' || p.version !== 1) throw new Error('This is not a supported gsnv-audio project.'); return { id: p.id, title: p.title, format: p.format, version: p.version, value: audioDocument({ operation: 'decode', content: p.content, assets: pkg.assets }) }; },
    encode(document) { const encoded = audioDocument({ operation: 'encode', value: document.value as AudioDocument }); return { project: { format: 'gsnv-audio', version: 1, id: document.id, title: document.title, content: encoded.content }, assets: encoded.assets }; },
    mount(host) {
      const document = host.root.ownerDocument, window = document.defaultView!;
      const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => { const e = document.createElement(tag); e.className = className; e.textContent = text; return e; };
      const stage = make('div', 'audio-stage'), transport = make('div', 'audio-transport'), edits = make('div', 'audio-edits'), notice = make('div', 'audio-notice'), plot = make('div', 'audio-plot'), range = make('div', 'audio-range'), info = make('div', 'audio-info');
      notice.id = `audio-notice-${crypto.randomUUID()}`; notice.hidden = true;
      transport.setAttribute('role', 'toolbar'); transport.setAttribute('aria-label', 'Audio transport'); edits.setAttribute('role', 'toolbar'); edits.setAttribute('aria-label', 'Audio editing');
      const buttons = new Map<string, HTMLButtonElement>();
      const button = (parent: HTMLElement, id: string, label: string) => { const e = make('button', 'xp-button', label); e.type = 'button'; e.dataset.audioCommand = id; e.onclick = () => run(id); parent.append(e); buttons.set(id, e); return e; };
      button(transport, 'audio.import', 'Import audio…'); button(transport, 'audio.togglePlayback', 'Play'); button(transport, 'audio.stop', 'Stop');
      const time = make('output', 'audio-time', '0.000 / 0.000 s'); time.setAttribute('aria-label', 'Playback position'); transport.append(time); button(transport, 'audio.export', 'Export WAV…');
      for (const [id, label] of [['edit.cut', 'Cut'], ['edit.copy', 'Copy'], ['edit.paste', 'Paste'], ['edit.delete', 'Delete'], ['audio.trim', 'Trim'], ['audio.fadeIn', 'Fade in'], ['audio.fadeOut', 'Fade out'], ['audio.normalize', 'Normalize…'], ['audio.volume', 'Volume…']]) button(edits, id!, label!);
      const field = (label: string) => { const wrap = make('label', 'audio-field', label), input = make('input', 'xp-field'); input.type = 'number'; input.min = '0'; input.step = '1'; input.value = '0'; input.setAttribute('aria-label', label); input.setAttribute('aria-describedby', notice.id); wrap.append(input); range.append(wrap); return input; };
      const startField = field('Selection start (frame)'), endField = field('Selection end (frame)');
      button(range, 'edit.selectAll', 'Select all'); button(range, 'audio.clearSelection', 'Clear'); button(range, 'audio.zoomSelection', 'Zoom selection'); button(range, 'audio.fit', 'Fit'); button(range, 'audio.zoomIn', '+'); button(range, 'audio.zoomOut', '−');
      buttons.get('audio.zoomIn')!.setAttribute('aria-label', 'Zoom in'); buttons.get('audio.zoomOut')!.setAttribute('aria-label', 'Zoom out');
      stage.append(transport, edits, notice, plot, range, info); host.root.append(stage);
      let current: Snapshot, value: AudioDocument | null = null, clipboard: AudioDocument | null = null, selection = { start: 0, end: 0 }, cursor = 0, message = '', busy = false, disposed = false;
      const available = typeof window.AudioContext === 'function';
      const wave = createAudioWaveform({ root: plot, selected(next) { player.stop(); selection = next; cursor = next.end; refresh(); }, command: run });
      const player = createAudioPlayback({ context: () => { if (!available) throw new Error('This browser cannot decode or play audio.'); return new window.AudioContext({ sampleRate: IMPORT_RATE }); }, requestFrame: fn => window.requestAnimationFrame(fn), cancelFrame: id => window.cancelAnimationFrame(id), changed(state) { if (!disposed) { cursor = state.frame; refreshPlayback(); } } });
      function show(text: string, error = false) { if (disposed) return; message = text; notice.textContent = text; notice.hidden = !text; notice.setAttribute('role', error ? 'alert' : 'status'); notice.dataset.error = String(error); host.invalidate(); }
      function enabled(id: string) {
        const loaded = !!value?.frames, selected = selection.end > selection.start;
        if (id === 'audio.import') return available && !busy;
        if (id === 'audio.stop') return player.state().playing;
        if (id === 'audio.togglePlayback') return available && loaded && !busy;
        if (id === 'edit.paste') return !!value && !!clipboard?.frames && !busy;
        if (['edit.cut', 'edit.copy', 'edit.delete', 'audio.trim', 'audio.normalize', 'audio.volume', 'audio.zoomSelection'].includes(id)) return loaded && selected && !busy;
        if (id === 'audio.fadeIn' || id === 'audio.fadeOut') return loaded && selection.end - selection.start >= 2 && !busy;
        return loaded && !busy;
      }
      function refreshPlayback() {
        const state = player.state(), total = value?.frames ?? 0, rate = value?.sampleRate ?? IMPORT_RATE;
        stage.dataset.playing = String(state.playing); time.dataset.frame = String(cursor); time.value = `${(cursor / rate).toFixed(3)} / ${(total / rate).toFixed(3)} s`;
        buttons.get('audio.togglePlayback')!.textContent = state.playing ? 'Stop playback' : 'Play'; buttons.get('audio.stop')!.disabled = !state.playing;
        wave.update(value, selection, cursor);
      }
      function refresh() {
        if (disposed) return; const frames = value?.frames ?? 0;
        for (const [id, b] of buttons) b.disabled = !enabled(id);
        for (const [field, number] of [[startField, selection.start], [endField, selection.end]] as const) { field.disabled = !value || busy; field.max = String(frames); if (field.getAttribute('aria-invalid') !== 'true' && document.activeElement !== field) field.value = String(number); }
        const seconds = value ? (selection.end - selection.start) / value.sampleRate : 0;
        info.textContent = value ? `${value.sampleRate} Hz · ${value.channels === 1 ? 'Mono' : 'Stereo'} · ${frames} frames · ${(frames / value.sampleRate).toFixed(3)} s · Selection ${selection.start}–${selection.end} (${seconds.toFixed(6)} s), end excluded` : 'Import local audio to begin. WAV, MP3, M4A, Ogg, FLAC and WebM support depends on this browser.';
        stage.setAttribute('aria-busy', String(busy)); refreshPlayback(); host.invalidate();
      }
      function selectFields(changed: HTMLInputElement) {
        if (!value) return; let start = startField.valueAsNumber, end = endField.valueAsNumber;
        if (![start, end].every(n => Number.isSafeInteger(n) && n >= 0 && n <= value!.frames)) { changed.setAttribute('aria-invalid', 'true'); show(`Selection needs whole frames from 0–${value.frames}. The previous range is unchanged.`, true); return; }
        if (start > end) { if (changed === startField) end = start; else start = end; }
        player.stop(); startField.removeAttribute('aria-invalid'); endField.removeAttribute('aria-invalid'); selection = { start, end }; cursor = start; startField.value = String(start); endField.value = String(end); show(''); refresh();
      }
      startField.onchange = () => selectFields(startField); endField.onchange = () => selectFields(endField);
      function apply(operation: string, amount = 1, selected = selection) {
        if (!value || !current) return;
        try {
          player.stop(); const base = { value, ...selected };
          let request: AudioEditRequest;
          if (operation === 'paste') { if (!clipboard) throw new Error('Copy some audio before pasting.'); request = { ...base, operation, clipboard }; }
          else if (operation === 'gain') request = { ...base, operation, factor: amount };
          else if (operation === 'normalize') request = { ...base, operation, peak: amount };
          else request = { ...base, operation: operation as 'copy' | 'cut' | 'delete' | 'trim' | 'fadeIn' | 'fadeOut' };
          const result = audioEdits(request); if (result.clipboard) clipboard = result.clipboard; selection = result.selection; cursor = selection.start;
          if (result.value !== value) { show(''); host.commit({ ...current, value: result.value }, labels[operation]!, current.identity); }
          else show(operation === 'copy' ? `Copied ${selected.end - selected.start} frames. Paste inserts at the cursor or replaces a selection.` : 'The selection is silent; its level is unchanged.');
          refresh();
        } catch (cause) { show(reason(cause), true); refresh(); }
      }
      function effect(operation: 'gain' | 'normalize') {
        const identity = current?.identity, selected = { ...selection }, normal = operation === 'normalize';
        host.dialog({ title: normal ? 'Normalize audio' : 'Change volume', fields: [{ key: 'amount', label: normal ? 'Target peak (%)' : 'Volume (%)', type: 'number', min: normal ? .01 : 0, max: normal ? 100 : 6400 }], initial: { amount: normal ? 95 : 100 },
          validate: fields => { const n = Number((fields as { amount: unknown }).amount); return Number.isFinite(n) && n >= (normal ? .01 : 0) && n <= (normal ? 100 : 6400) ? { ok: true, value: fields } : { ok: false, error: { code: 'audio.level', message: 'Enter a percentage inside the displayed limits.' } }; }, preview() {}, cancel() {},
          commit: fields => { if (current?.identity !== identity) { show('The audio changed while this dialog was open. Select the range and try again.', true); return; } apply(operation, Number((fields as { amount: unknown }).amount) / 100, selected); } });
      }
      async function importAudio() {
        if (busy || !available) return; const identity = current?.identity; busy = true; player.stop(); show('Choose a local audio file. Import decodes at 48000 Hz.'); refresh();
        try {
          const opened = await fileAccess({ op: 'open', accept: { 'audio/*': ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac', '.webm'] } }, files);
          if (disposed || 'cancelled' in opened) { show(''); return; } if (!opened.ok) throw new Error(opened.error.message);
          const length = opened.value.bytes.reduce((n, b) => n + b.length, 0); if (!length || length > MAX_IMPORT_BYTES) throw new Error('Choose a nonempty audio file no larger than 128 MiB.');
          const bytes = new Uint8Array(length); let offset = 0; for (const part of opened.value.bytes) { bytes.set(part, offset); offset += part.length; }
          show(`Decoding ${opened.value.name} locally…`); let decoded: AudioBuffer;
          try { decoded = await player.decode(bytes); } catch { throw new Error(`Could not decode "${opened.value.name}". Try a valid WAV, MP3 or another format supported by this browser.`); }
          if (disposed) return; if (current?.identity !== identity) throw new Error('The audio changed during import. Import the file again.');
          if (decoded.numberOfChannels > 2 || decoded.numberOfChannels < 1) throw new Error('Import supports mono or stereo audio. Convert this file to one or two channels.');
          if (decoded.length * decoded.numberOfChannels * 4 > MAX_PCM_BYTES) throw new Error('Decoded audio exceeds 256 MiB. Choose a shorter recording.');
          const imported = audioDocument({ operation: 'import', id: crypto.randomUUID(), sampleRate: decoded.sampleRate, channels: Array.from({ length: decoded.numberOfChannels }, (_, c) => decoded.getChannelData(c)) });
          const openedDocument = await host.open(blank(imported, opened.value.name.replace(/\.[^.]+$/, '')));
          if (openedDocument) { show(`Decoded locally at ${decoded.sampleRate} Hz. Import resamples audio to ${IMPORT_RATE} Hz; native projects retain their stored rate.`); wave.focus(); }
        } catch (cause) { show(reason(cause), true); } finally { busy = false; refresh(); }
      }
      async function exportWav() {
        if (!value || !current || busy) return; busy = true; const output = value, title = current.title; refresh();
        try { const bytes = audioSamples({ operation: 'wav', value: output }); const saved = await fileAccess({ op: 'save', name: `${title || 'audio'}.wav`, mime: 'audio/wav', bytes }, files);
          if ('cancelled' in saved) return; if (!saved.ok) throw new Error(saved.error.message); show(saved.value.handle ? `Saved ${saved.value.name}.` : `WAV download handed to the browser: ${saved.value.name}.`);
        } catch (cause) { show(reason(cause), true); } finally { busy = false; refresh(); }
      }
      function run(id: string) {
        if (id === 'tool.cancel' || id === 'audio.stop') { player.stop(); refresh(); return; }
        if (busy) return;
        if (id === 'audio.import') { void importAudio(); return; }
        if (id === 'audio.export') { void exportWav(); return; }
        if (!value) return;
        if (id === 'audio.togglePlayback') { if (player.state().playing) player.stop(); else { show(''); const start = selection.start < selection.end ? selection.start : cursor < value.frames ? cursor : 0, end = selection.start < selection.end ? selection.end : value.frames; void player.play(value, start, end).catch(cause => show(reason(cause), true)); } return; }
        if (id === 'edit.selectAll' || id === 'audio.clearSelection') { player.stop(); selection = id === 'edit.selectAll' ? { start: 0, end: value.frames } : { start: selection.start, end: selection.start }; cursor = selection.start; refresh(); return; }
        if (id === 'audio.volume' || id === 'audio.normalize') { effect(id === 'audio.volume' ? 'gain' : 'normalize'); return; }
        const zoom = { 'audio.zoomIn': 'in', 'audio.zoomOut': 'out', 'audio.zoomSelection': 'selection', 'audio.fit': 'all' } as const;
        if (id in zoom) { wave.zoom(zoom[id as keyof typeof zoom]); wave.focus(); return; }
        const operation = id.replace(/^(edit|audio)\./, ''); if (operation in labels) apply(operation);
      }
      const hidden = new window.MutationObserver(() => { if (host.root.hidden) player.stop(); }); hidden.observe(host.root, { attributes: true, attributeFilter: ['hidden'] });
      const visibility = () => { if (document.hidden) player.stop(); }; document.addEventListener('visibilitychange', visibility);
      if (!available) show('This browser cannot decode or play audio. Native project editing and WAV export are still available.', true);
      return {
        render(next) { const changed = next?.value !== value; if (next?.id !== current?.id) { selection = { start: 0, end: (next?.value as AudioDocument | undefined)?.frames ?? 0 }; cursor = 0; startField.removeAttribute('aria-invalid'); endField.removeAttribute('aria-invalid'); if (available) show(''); }
          current = next; value = next ? next.value as AudioDocument : null; selection = { start: Math.min(selection.start, value?.frames ?? 0), end: Math.min(selection.end, value?.frames ?? 0) }; if (changed) { player.stop(); cursor = selection.start; } cursor = Math.min(cursor, value?.frames ?? 0); refresh(); },
        model() { const item = (id: string, label: string, shortcut = '') => ({ id, label, shortcut, enabled: enabled(id) }); return { menus: [
          { id: 'audio', label: 'Audio', items: [item('audio.import', 'Import audio…'), item('audio.export', 'Export WAV…'), item('audio.togglePlayback', 'Play / stop', 'Space'), item('audio.stop', 'Stop', 'Esc')] },
          { id: 'selection', label: 'Selection', items: [item('edit.cut', 'Cut', 'Ctrl+X'), item('edit.copy', 'Copy', 'Ctrl+C'), item('edit.paste', 'Paste', 'Ctrl+V'), item('edit.delete', 'Delete', 'Delete'), item('edit.selectAll', 'Select all', 'Ctrl+A'), item('audio.trim', 'Trim to selection'), item('audio.zoomSelection', 'Zoom to selection'), item('audio.fit', 'Fit recording')] },
          { id: 'effects', label: 'Effects', items: [item('audio.fadeIn', 'Fade in'), item('audio.fadeOut', 'Fade out'), item('audio.normalize', 'Normalize…'), item('audio.volume', 'Volume…')] },
        ], tools: [], panels: [] }; },
        context: () => ({ viewRole: 'timeline', activeTool: 'audio.selection', status: message || info.textContent || '' }), command: run, gesture() {},
        dispose() { if (disposed) return; disposed = true; hidden.disconnect(); document.removeEventListener('visibilitychange', visibility); player.dispose(); wave.dispose(); stage.remove(); },
      };
    },
  };
}
