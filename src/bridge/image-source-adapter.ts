/**
 * PURPOSE    Guard Image snapshots against uncommitted view operations (D02).
 * KIND       CORE
 * CONTRACT   IN: committed document/readiness readers. OUT: EditorBridge.
 *            RAISES: BridgePendingEdit, BridgeUnavailable, BridgeRevisionError.
 * GUARANTEES Never places floating pixels, commits a preview or changes the source.
 * TUNING     None; the owning view reports each pending operation.
 * DECISIONS  D1: The view reports readiness; the compositor reads committed tiles.
 *            Alternative: capture-triggered commits alter editing history.
 *            Revisit if: Image offers an explicit snapshot transaction of its own.
 * LIMITS     Whole composite only, not a selection or cropped viewport.
 * TESTBENCH  src/bridge/image-source-adapter.test.ts
 */
import type { ImageContent } from '../image/image-content.ts';
import { imageSource } from './image-source.ts';
import type { EditorBridge } from './workspace-bridge.ts';
export function imageSourceAdapter({ read, pending }: { read(): { id: string; identity: string; title: string; value: ImageContent } | undefined; pending(): string }): EditorBridge {
  const prepare: EditorBridge['prepare'] = role => {
    const operation = pending(); if (operation) throw Object.assign(new Error(`Finish or cancel the ${operation} before sending or receiving an Image.`), { name: 'BridgePendingEdit' });
    if (role === 'source' && !read()) throw Object.assign(new Error('Open an Image project first.'), { name: 'BridgeUnavailable' });
  };
  return { prepare, revision: () => `${read()?.identity ?? 'empty'}:${pending() || 'ready'}`, async capture(intent, source, signal) {
    signal.throwIfAborted(); prepare('source'); const value = read()!;
    if (intent.route !== 'image-to-video-bin' || source.workspace !== 'image' || source.identity !== value.identity || source.documentId !== value.id) throw Object.assign(new Error('The Image source changed. Send it again.'), { name: 'BridgeRevisionError' });
    return imageSource({ value: value.value, source, label: value.title });
  } };
}
