/**
 * PURPOSE    Connect committed CAD capture to the explicit Image transfer (D04).
 * KIND       SHELL
 * CONTRACT   IN: C35 viewport, title and shared dialog/transfer ports. OUT: editor
 *            bridge plus ready/send. RAISES: unavailable/stale/capture errors.
 * GUARANTEES No CAD edit or preview; dimensions are explicit aspect-locked choices.
 * TUNING     Native, half, quarter and double sizes within C35's 4,194,304 pixels.
 * DECISIONS  D1: Fixed size choices preserve aspect. Alternative: independent width
 *            and height fields permit distorted framing. Revisit if: shared dialogs
 *            support reactive aspect-locked controls.
 * LIMITS     Solid view only; original CAD project and its history remain separate.
 * TESTBENCH  src/bridge/cad-source-adapter.test.ts; bridge-workspace.browser.spec.ts
 */
import { captureCADViewport, type CadCapturePort } from '../cad/cad-viewport-capture.ts';
import type { DialogSpec } from '../shared/dialog.ts';
import { transferRaster, type TransferIntent } from './transfer-contract.ts';
import type { EditorBridge, BridgeResult } from './workspace-bridge.ts';
export function cadSourceAdapter({ viewport, title, dialog, transfer }: { viewport: CadCapturePort; title(): string; dialog(spec: DialogSpec): void; transfer: ((intent: TransferIntent) => Promise<BridgeResult>) | undefined }) {
  let requested: ReturnType<CadCapturePort['read']> | undefined;
  const bridge: EditorBridge = {
    prepare() { if(requested&&!viewport.isCurrent(requested))throw Object.assign(new Error('The CAD view changed while choosing capture dimensions. Send the current view again.'),{name:'StaleCaptureError'});viewport.read(); },
    revision() { try { const value = viewport.read(); return value.viewRevision; } catch { return 'unavailable'; } },
    async capture(intent, source, signal) {
      if (intent.route !== 'cad-viewport-to-image' || source.workspace !== 'cad') throw new Error('CAD can send only its transparent viewport to Image.');
      const pixels = await captureCADViewport({ viewport, width: intent.width, height: intent.height, expected: { documentIdentity: source.identity, viewRevision: source.viewRevision }, signal });
      return transferRaster({ version: 1, route: intent.route, source, label: `${title()} view`, background: 'transparent', pixels });
    },
  };
  const ready = () => { try { viewport.read(); return !!transfer; } catch { return false; } };
  return { bridge, ready, send() {
    if (!transfer) return;
    const stamp = viewport.read(), scale = Math.min(1, Math.sqrt(4_194_304 / (stamp.width * stamp.height)));
    const choices = [...new Set([scale, scale / 2, scale / 4, 2].map(n => `${Math.max(1, Math.floor(stamp.width*n))}x${Math.max(1, Math.floor(stamp.height*n))}`))]
      .map(value => { const [width,height] = value.split('x').map(Number) as [number,number]; return { value, label: `${width} × ${height} pixels`, width, height }; }).filter(n => n.width * n.height <= 4_194_304);
    const nativeSize = `${stamp.width}x${stamp.height}`, nativeFits = choices.some(choice => choice.value === nativeSize);
    dialog({ title: 'Send transparent CAD view to Image', fields: [{ key: 'size', label: nativeFits ? 'Image dimensions (viewport aspect ratio)' : `Viewport is ${stamp.width} × ${stamp.height}. Choose a smaller image (4,194,304 pixels maximum).`, type: 'select', choices }], initial: { size: nativeFits ? nativeSize : '' },
      validate(values) { const selected = choices.find(n => n.value === values.size); return selected && viewport.isCurrent(stamp) ? { ok: true, value: { width: selected.width, height: selected.height } } : { ok: false, error: { code: 'cad.capture', message: 'The CAD view changed or the size is unavailable. Close this dialog and try again.' } }; },
      preview() {}, cancel() {}, commit(value) { const size = value as { width: number; height: number }; requested=stamp;void transfer({ route: 'cad-viewport-to-image', width: size.width, height: size.height }).finally(()=>{if(requested===stamp)requested=undefined;}); },
    });
  } };
}
