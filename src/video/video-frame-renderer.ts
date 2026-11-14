/**
 * PURPOSE    Render the same full-resolution Video composition for preview/capture.
 * KIND       SHELL
 * CONTRACT   IN: Canvas2D context, validated timeline/time and decoded media lookup.
 *            OUT: opaque project-size frame with letterboxing, fades and titles.
 *            RAISES: Canvas errors. Media readiness is the caller's responsibility.
 * GUARANTEES No document, media playback, gain, time or source pixel mutation.
 * TUNING     Existing Tahoma/Verdana title style and 0.3-second title fade.
 * DECISIONS  D1: Share composition. Alternative: copying the display canvas risks a
 *            stale seek frame. Revisit if: a correction stage changes composition.
 * LIMITS     Current single sequence and titles; no correction stage yet.
 * TESTBENCH  src/bridge/bridge-raster.browser.spec.ts -- run with: playwright test --config src/bridge/bridge.playwright.config.ts
 */
import { videoTimeline, type VideoContent, type Title } from './video-timeline.ts';
export function renderVideoFrame(ctx: CanvasRenderingContext2D, value: VideoContent, time: number, source: (mediaId: string) => HTMLVideoElement | HTMLImageElement | undefined): void {
  const canvas = ctx.canvas; canvas.width = value.width; canvas.height = value.height; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, value.width, value.height);
  const at = videoTimeline({ operation: 'locate', value, time });
  if (at) {
    const el = source(at.media.id), w = el && ('videoWidth' in el ? el.videoWidth : el.naturalWidth), h = el && ('videoHeight' in el ? el.videoHeight : el.naturalHeight);
    if (el && w && h) { const s = Math.min(value.width / w, value.height / h), dw = w * s, dh = h * s; ctx.drawImage(el, (value.width - dw) / 2, (value.height - dh) / 2, dw, dh); }
    if (at.fade < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - at.fade})`; ctx.fillRect(0, 0, value.width, value.height); }
  }
  for (const title of value.titles) if (time >= title.start && time < title.start + title.duration) drawTitle(ctx, title, time);
}
function drawTitle(ctx: CanvasRenderingContext2D, title: Title, time: number) {
  const { width, height } = ctx.canvas, lines = title.text.split('\n'), size = title.size * height / 720, lineHeight = size * 1.2;
  ctx.font = `bold ${size}px Tahoma, Verdana, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const block = lineHeight * lines.length, y0 = title.position === 'top' ? height * .12 : title.position === 'middle' ? (height - block) / 2 + lineHeight / 2 : height * .88 - block + lineHeight / 2;
  ctx.globalAlpha = Math.max(0, Math.min(1, (time - title.start) / .3, (title.start + title.duration - time) / .3));
  if (title.background) { const w = Math.max(...lines.map(line => ctx.measureText(line).width)) + size; ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect((width - w) / 2, y0 - lineHeight / 2, w, block); }
  ctx.fillStyle = title.color; lines.forEach((line, i) => ctx.fillText(line, width / 2, y0 + i * lineHeight)); ctx.globalAlpha = 1;
}
