/**
 * PURPOSE    Present retained Video media with explicit placement/removal (V31).
 * KIND       SHELL
 * CONTRACT   IN: DOM root, action callback, immutable content and owned URL reader.
 *            OUT: update/dispose. RAISES: DOM errors for an invalid host.
 * GUARANTEES No implicit placement/deletion; names use text nodes, referenced media
 *            cannot be removed, and local thumbnails have no playback controls.
 * TUNING     Thumbnail size belongs to video-workspace.css.
 * DECISIONS  D1: Reuse workspace-owned blob URLs. Alternative: copying media bytes
 *            for thumbnails duplicates memory. Revisit if: a thumbnail cache appears.
 * LIMITS     Video thumbnail is the browser's first available frame.
 * TESTBENCH  src/video/video-media-bin.test.ts
 */
import type { VideoContent } from './video-timeline.ts';
export function videoMediaBin({ root, action }: { root: HTMLElement; action(kind: 'place' | 'remove', id: string): void }) {
  const document = root.ownerDocument; let previous: VideoContent | null | undefined;
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => { const el = document.createElement(tag); if (text) el.textContent = text; return el; };
  const clear = () => { for (const video of root.querySelectorAll('video')) { video.removeAttribute('src'); video.load(); } root.replaceChildren(); };
  return { update(value: VideoContent | null, url: (id: string) => string | undefined) {
    if (value === previous) return; previous = value; clear(); root.className = 'video-media-bin';
    if (!value?.media.length) { root.append(node('p', 'Empty. Send an Image here, or add local media.')); return; }
    for (const media of value.media) {
      const row = node('section'), name = node('strong', media.name), info = node('small', `${media.width} × ${media.height} px · ${media.kind}`), buttons = node('div'); row.dataset.mediaId = media.id;
      const source = url(media.id);
      if (source) { const thumb = media.kind === 'image' ? node('img') : node('video'); thumb.src = source; thumb.className = 'video-bin-thumbnail'; if ('alt' in thumb) thumb.alt = ''; else { thumb.muted = true; thumb.preload = 'metadata'; thumb.playsInline = true; } row.append(thumb); }
      for (const [kind,label] of [['place','Add to timeline'],['remove','Remove']] as const) {
        const button = node('button', label); button.type = 'button'; button.className = 'xp-button'; button.dataset.binAction = kind;
        button.disabled = kind === 'remove' && value.clips.some(c => c.mediaId === media.id); if (button.disabled) button.title = 'Remove its timeline clips before removing this bin item.';
        button.onclick = () => { if (!button.disabled) action(kind, media.id); }; buttons.append(button);
      }
      row.append(name,info,buttons); root.append(row);
    }
  }, dispose() { clear(); previous = undefined; } };
}
