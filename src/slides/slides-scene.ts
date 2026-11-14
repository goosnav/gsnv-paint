/**
 * PURPOSE    Render one slide as a portable DOM scene.
 * KIND       SHELL
 * CONTRACT   IN: DOM document, validated P01 deck and existing slide ID. OUT: owned clipped scene DOM.
 *            RAISES: TypeError for invalid resources; Error for an unavailable slide.
 * GUARANTEES Text stays text; images use only deck-local raster data; no event handlers or remote fetches.
 * TUNING     Geometry and typography come from the deck, with a 1.15 text line height.
 * DECISIONS  D1: Inline styles travel with the scene into printing. Alternative: a separate print renderer
 *            could drift from the editor. Revisit if a common scene graph replaces DOM rendering.
 * LIMITS     Visual layout and raster decoding require a browser; validated content is a precondition.
 * TESTBENCH  src/slides/slides-scene.test.ts -- run with: node --import tsx --test src/slides/slides-scene.test.ts
 */
import type { SlidesDocument } from './slides-document.ts';
export function slidesScene(document: Document, deck: SlidesDocument, slideId: string): HTMLElement {
  if (!document?.createElement) throw new TypeError('A DOM document is required.');
  const slide = deck.slides.find(s => s.id === slideId); if (!slide) throw new Error('That slide no longer exists.');
  const scene = document.createElement('div'); scene.className = 'slides-scene'; scene.dataset.slideId = slideId;
  Object.assign(scene.style, { position: 'relative', width: `${deck.width}px`, height: `${deck.height}px`, overflow: 'hidden', background: slide.background, flexShrink: '0', boxSizing: 'border-box' });
  for (const element of slide.elements) {
    const item = document.createElement('div'); item.dataset.elementId = element.id; item.dataset.elementKind = element.kind;
    Object.assign(item.style, { position: 'absolute', left: `${element.x}px`, top: `${element.y}px`, width: `${element.width}px`, height: `${element.height}px`, transform: `rotate(${element.rotation}deg)`, transformOrigin: 'top left', boxSizing: 'border-box', overflow: 'hidden' });
    if (element.kind === 'text') {
      item.textContent = element.text;
      Object.assign(item.style, { whiteSpace: 'pre-wrap', overflowWrap: 'break-word', fontFamily: element.fontFamily, fontSize: `${element.fontSize}px`, lineHeight: '1.15', fontWeight: element.bold ? 'bold' : 'normal', fontStyle: element.italic ? 'italic' : 'normal', textAlign: element.align, color: element.color });
    } else if (element.kind === 'image') {
      const asset = deck.images.find(p => p.id === element.assetId)!;
      const image = document.createElement('img'); image.alt = element.alt; image.draggable = false; image.src = `data:${asset.mime};base64,${asset.data}`;
      Object.assign(image.style, { width: '100%', height: '100%', objectFit: 'fill', display: 'block', pointerEvents: 'none' }); item.append(image);
    } else Object.assign(item.style, { background: element.fill, border: `${element.strokeWidth}px solid ${element.stroke}`, borderRadius: element.kind === 'ellipse' ? '50%' : '0' });
    scene.append(item);
  }
  return scene;
}
