/**
 * PURPOSE    Materialize a transfer without applying it to live editors (D05).
 * KIND       SHELL
 * CONTRACT   IN: D01 transfer, optional target, fresh document/media IDs and signal.
 *            OUT: new editable Image or Video bin append candidate; absent Video
 *            includes an empty initial document so the append has one undo step.
 *            RAISES: BridgeDeliveryError, PNG/format validation or AbortError.
 * GUARANTEES No target/source mutation, navigation, files, storage or handle reuse.
 * TUNING     Generated stills use lossless PNG and a 3-second default placement.
 * DECISIONS  D1: Reuse current native media-ID mapping. Alternative: a second
 *            assetId field would duplicate the current one-to-one relationship.
 *            Revisit if Video's native media schema changes.
 * LIMITS     Shell must compare identities, guard replacement and acknowledge apply.
 * TESTBENCH  src/bridge/destination-adapter.test.ts
 */
import type { AppDocument } from '../app/app-shell.ts';
import { imageContent } from '../image/image-content.ts';
import { videoTimeline, type VideoContent } from '../video/video-timeline.ts';
import type { TransferRaster } from './transfer-contract.ts';
import { encodePng } from './png-encode.ts';
export type BridgeDelivery = { kind: 'replace'; workspace: 'image'; document: AppDocument } | { kind: 'append'; workspace: 'video'; document: AppDocument; initial?: AppDocument };
export async function deliverRaster({ transfer, target, newId, mediaId, signal }: { transfer: TransferRaster; target?: AppDocument; newId: string; mediaId: string; signal?: AbortSignal }): Promise<BridgeDelivery> {
  // A-D validates D01 immediately before this typed, internal destination seam.
  signal?.throwIfAborted(); const raster = transfer, { width, height, rgba } = raster.pixels;
  if (!newId || !mediaId) throw Object.assign(new Error('Transfer IDs are missing.'), { name: 'BridgeDeliveryError' });
  if (raster.route !== 'image-to-video-bin') {
    const value = imageContent({ operation: 'layers', previous: null, width, height, activeLayerId: 'received', layers: [{ meta: { id: 'received', name: raster.label, visible: true, opacity: 1, blend: 'normal' }, raster: { width, height, data: rgba } }] });
    return { kind: 'replace', workspace: 'image', document: { id: newId, title: raster.label, format: 'gsnv-image', version: 1, value } };
  }
  if (target && target.format !== 'gsnv-video') throw Object.assign(new Error('The destination is not a Video project.'), { name: 'BridgeDeliveryError' });
  const bytes = await encodePng(raster.pixels, signal); signal?.throwIfAborted();
  const base: AppDocument = target ?? { id: newId, title: 'Untitled video', format: 'gsnv-video', version: 1, value: videoTimeline({ operation: 'new' }) };
  const value = videoTimeline({ operation: 'edit', value: base.value as VideoContent, op: { kind: 'import-media', media: { id: mediaId, name: `${raster.label}.png`, mime: 'image/png', kind: 'image', duration: 3, width, height }, bytes } });
  return { kind: 'append', workspace: 'video', document: { ...base, value }, ...(!target ? { initial: base } : {}) };
}
