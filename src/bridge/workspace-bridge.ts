/**
 * PURPOSE    Coordinate guarded snapshot transfers without owning editor state (A-D).
 * KIND       SHELL
 * CONTRACT   IN: explicit shell read/prepare/guard/compare-apply ports. OUT: transfer
 *            result, cancel and busy state. All source/target/view epochs are checked
 *            after awaits; only an acknowledged synchronous apply reports success.
 *            RAISES: operational failures are returned as typed BridgeResult.
 * GUARANTEES No source edit, hidden-view render, storage bypass or late apply.
 * TUNING     One active operation; newer requests cancel older jobs.
 * DECISIONS  D1: Shell owns durable backup/replacement and history. Alternative:
 *            direct adapter replacement bypasses guards. Revisit if: the shared app
 *            replaces its single-document-per-workspace lifecycle.
 * LIMITS     New Image follows ordinary New/Open history reset, not persistent undo.
 * TESTBENCH  src/bridge/workspace-bridge.test.ts; app-shell bridge/browser tests
 */
import type { AppDocument } from '../app/app-shell.ts';
import { deliverRaster, type BridgeDelivery } from './destination-adapter.ts';
import { transferRaster, type TransferIntent, type TransferRaster } from './transfer-contract.ts';
type Workspace = 'image' | 'video' | 'cad';
type Snapshot = AppDocument & { identity: string };
export type EditorBridge = { prepare(role: 'source' | 'target'): void; revision(): string; capture(intent: TransferIntent, source: TransferRaster['source'], signal: AbortSignal): Promise<TransferRaster> };
export type BridgeResult = { ok: true; workspace: 'image' | 'video'; documentId: string; identity: string } | { ok: false; code: 'pending-edit' | 'unavailable' | 'stale' | 'invalid-raster' | 'capture' | 'encode' | 'replacement' | 'cancelled'; message: string };
type State = { document: Snapshot | undefined; epoch: number; editor: EditorBridge | undefined };
type Ports = { active(): string; available(workspace: Workspace): boolean; read(workspace: Workspace): State; prepare(workspace: Workspace, role: 'source' | 'target'): void; mayReplace(workspace: 'image' | 'video', newId: string): Promise<boolean>; apply(delivery: BridgeDelivery, expected: State): Snapshot | undefined; newId(): string };
const fail = (name: string, message: string): never => { throw Object.assign(new Error(message), { name }); };
export function createWorkspaceBridge(ports: Ports) {
  let job: AbortController | undefined;
  const cancel = () => { job?.abort(); job = undefined; };
  return { cancel, get busy() { return !!job; }, async transfer(workspace: Workspace, intent: TransferIntent): Promise<BridgeResult> {
    cancel(); const currentJob = new AbortController(); job = currentJob; const signal = currentJob.signal;
    try {
      const allowed = intent.route === 'image-to-video-bin' ? 'image' : intent.route === 'video-frame-to-image' ? 'video' : 'cad';
      const target = intent.route === 'image-to-video-bin' ? 'video' : 'image';
      if (workspace !== allowed || ports.active() !== workspace || !ports.available(target)) fail('BridgeUnavailable', 'This workspace transfer is unavailable.');
      ports.prepare(workspace, 'source'); const origin = ports.read(workspace), view = origin.editor;
      if (!origin.document || !view) fail('BridgeUnavailable', 'Open a source project before sending it.');
      const document = origin.document!, source = { workspace, documentId: document.id, identity: document.identity, epoch: origin.epoch, viewRevision: view!.revision() };
      ports.prepare(target, 'target'); const destination = ports.read(target);
      const check = () => {
        signal.throwIfAborted(); const now = ports.read(workspace), next = ports.read(target);
        if (ports.active() !== workspace || now.epoch !== origin.epoch || now.document?.identity !== document.identity || now.document?.id !== document.id || view!.revision() !== source.viewRevision || next.epoch !== destination.epoch || next.document?.identity !== destination.document?.identity || next.document?.id !== destination.document?.id) fail('BridgeStale', 'A source or target changed during transfer. Current projects kept; send again.');
      };
      check(); const raster = transferRaster(await view!.capture(intent, source, signal)); check();
      if (raster.route !== intent.route || (Object.keys(source) as (keyof typeof source)[]).some(key => raster.source[key] !== source[key])) fail('BridgeStale', 'Capture returned a different source revision.');
      const delivery = await deliverRaster({ transfer: raster, ...(destination.document ? { target: destination.document } : {}), newId: ports.newId(), mediaId: ports.newId(), signal }); check();
      if (delivery.kind === 'replace' || delivery.initial) {
        if (!await ports.mayReplace(target, delivery.document.id)) return { ok: false, code: 'replacement', message: 'Current target kept. Save it before trying again.' }; check();
      }
      const applied = ports.apply(delivery, destination);
      if (!applied) return fail('BridgeStale', 'The target changed before the transfer could be applied.');
      return { ok: true, workspace: delivery.workspace, documentId: applied.id, identity: applied.identity };
    } catch (cause) {
      const name = cause instanceof Error ? cause.name : '', message = cause instanceof Error ? cause.message : String(cause);
      const code = signal.aborted ? 'cancelled' : name === 'BridgeUnavailable' ? 'unavailable' : /Stale|Revision/.test(name) ? 'stale' : name === 'BridgeRasterError' || name === 'BridgeDirectionError' ? 'invalid-raster' : name === 'BridgeEncodeError' ? 'encode' : name === 'BridgePendingEdit' ? 'pending-edit' : 'capture';
      return { ok: false, code, message };
    } finally { if (job === currentJob) job = undefined; }
  } };
}
