/**
 * PURPOSE    Capture the requested committed full-resolution Video frame (D03).
 * KIND       SHELL
 * CONTRACT   IN: local timeline bytes, time, document/view stamp, DOM and current
 *            predicate/signal. OUT: D01 owned frame after decoding and seeking.
 *            RAISES: BridgeFrameReadbackError, BridgeFrameRevisionError, AbortError.
 * GUARANTEES Private decoder never changes the preview playhead or its media.
 *            All listeners, timeouts and local object URLs are released on exit.
 * TUNING     10-second decode/seek timeout. Timeline supplies a half-open trim sample;
 *            finite decoded duration further bounds it, never before clip in.
 *            Unknown positive duration is allowed only with a ready bounded seek.
 * DECISIONS  D1: Seek a private media element. Alternative: the display canvas can
 *            contain a previous frame. Revisit if: frame-exact demux replaces HTML
 *            media decoding.
 * LIMITS     HTMLMediaElement seek precision; current compositor has no correction.
 * TESTBENCH  src/bridge/video-source-adapter.test.ts; bridge-raster.browser.spec.ts
 */
import { videoTimeline, type VideoContent } from '../video/video-timeline.ts';
import { renderVideoFrame } from '../video/video-frame-renderer.ts';
import { transferRaster, type TransferRaster } from './transfer-contract.ts';
type VideoTransfer = Extract<TransferRaster, { route: 'video-frame-to-image' }>;
const fail = (name: string, message: string): never => { throw Object.assign(new Error(message), { name }); };
function waitFor(element: HTMLMediaElement | HTMLImageElement, event: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); element.removeEventListener(event, done); element.removeEventListener('error', error); signal?.removeEventListener('abort', abort); };
    const done = () => { cleanup(); resolve(); }, error = () => { cleanup(); reject(Object.assign(new Error('This media frame could not be decoded.'), { name: 'BridgeFrameReadbackError' })); }, abort = () => { cleanup(); reject(signal!.reason); };
    const timer = setTimeout(error, 10000); element.addEventListener(event, done, { once: true }); element.addEventListener('error', error, { once: true }); signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
  });
}
export async function videoSource({ document, value, time, source, label, isCurrent, signal }: { document: Document; value: VideoContent; time: number; source: VideoTransfer['source']; label: string; isCurrent: () => boolean; signal?: AbortSignal }): Promise<VideoTransfer> {
  signal?.throwIfAborted(); if (!isCurrent()) fail('BridgeFrameRevisionError', 'The Video frame changed. Send it again.');
  const at = videoTimeline({ operation: 'locate', value, time }), bytes = at && value.bytes.get(at.media.id);
  if (!at || !bytes) fail('BridgeFrameReadbackError', 'Put the playhead on a decodable timeline clip first.');
  const located = at!, url = URL.createObjectURL(new Blob([bytes!.slice()], { type: located.media.mime }));
  const element = located.media.kind === 'video' ? document.createElement('video') : document.createElement('img');
  try {
    if ('videoWidth' in element) {
      element.preload = 'auto'; element.muted = true; element.playsInline = true;
      const loaded = waitFor(element, 'loadeddata', signal); element.src = url; element.load(); await loaded;
      if (Number.isNaN(element.duration) || element.duration <= located.clip.in) fail('BridgeFrameReadbackError', 'This clip starts beyond the decoded media duration.');
      const requested = Math.min(located.source, Math.max(located.clip.in, element.duration - 0.000001));
      if (!Number.isFinite(requested) || requested >= element.duration || requested < located.clip.in) fail('BridgeFrameReadbackError', 'The Video frame time could not be decoded inside this clip.');
      if (Math.abs(element.currentTime - requested) > 0.000001) { const sought = waitFor(element, 'seeked', signal); element.currentTime = requested; await sought; }
      if (Number.isNaN(element.duration) || element.duration <= located.clip.in || !Number.isFinite(element.currentTime) || element.currentTime < located.clip.in || element.currentTime >= Math.min(located.clip.out, element.duration)) fail('BridgeFrameReadbackError', 'The decoded Video frame is outside this clip.');
      if (element.seeking || element.readyState < 2 || Math.abs(element.currentTime - requested) > 0.01) fail('BridgeFrameReadbackError', 'The requested Video frame is not ready.');
    } else { const loaded = waitFor(element, 'load', signal); element.src = url; await loaded; await element.decode(); }
    signal?.throwIfAborted(); if (!isCurrent()) fail('BridgeFrameRevisionError', 'The Video frame changed during decoding.');
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { colorSpace: 'srgb' }); if (!ctx) fail('BridgeFrameReadbackError', 'Canvas frame capture is unavailable.');
    renderVideoFrame(ctx!, value, time, id => id === located.media.id ? element : undefined);
    const rgba = ctx!.getImageData(0,0,value.width,value.height).data;
    return transferRaster({ version: 1, route: 'video-frame-to-image', source, label, frame: { timelineSeconds: time, fps: value.fps }, pixels: { width: value.width, height: value.height, rgba, colorSpace: 'srgb', alpha: 'straight' } }) as VideoTransfer;
  } finally { if ('pause' in element) element.pause(); element.removeAttribute('src'); if ('load' in element) element.load(); URL.revokeObjectURL(url); }
}
