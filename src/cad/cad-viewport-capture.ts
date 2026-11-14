/**
 * PURPOSE    Capture committed CAD geometry with transparent antialiased edges (C35).
 * KIND       SHELL
 * CONTRACT   IN: live typed viewport, requested size, expected document/view stamp,
 *            optional AbortSignal. OUT: owned top-left straight-alpha sRGB RGBA8.
 *            RAISES: CaptureSizeError, StaleCaptureError, ContextLostError,
 *            CaptureReadbackError; AbortError for cancelled work.
 * GUARANTEES Original scene, camera and renderer remain unchanged. Only a cloned
 *            scene is rendered; temporary context/resources are always disposed.
 * TUNING     Capture ceiling 4,194,304 pixels and device renderbuffer limits.
 * DECISIONS  D1: A temporary transparent WebGL canvas keeps the visible renderer
 *            unchanged. Alternative: offscreen targets need separate color/MSAA and
 *            restoration paths. Revisit if: temporary context cost is material.
 * LIMITS     WebGL2 with antialiasing required; supported opaque CAD materials.
 *            Straight-alpha conversion is from resolved premultiplied sRGB pixels.
 * TESTBENCH  src/cad/cad-viewport-capture.test.ts -- plus src/bridge/bridge-raster.browser.spec.ts
 */
import * as THREE from 'three';
type CaptureStamp = Readonly<{ documentIdentity: string; viewRevision: string }>;
export type CadCapturePort = {
  read(): CaptureStamp & Readonly<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.OrthographicCamera; overlays: readonly THREE.Object3D[]; width: number; height: number }>;
  isCurrent(stamp: CaptureStamp): boolean;
};
export type ViewportCapture = { width: number; height: number; rgba: Uint8ClampedArray<ArrayBuffer>; colorSpace: 'srgb'; alpha: 'straight'; source: 'cad'; stamp: CaptureStamp };
const fail = (name: string, message: string): never => { throw Object.assign(new Error(message), { name }); };
export async function captureCADViewport({ viewport, width, height, expected, signal }: { viewport: CadCapturePort; width: number; height: number; expected: CaptureStamp; signal?: AbortSignal }): Promise<ViewportCapture> {
  signal?.throwIfAborted();
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > 4_194_304) fail('CaptureSizeError', 'Use positive dimensions up to 4,194,304 pixels for CAD capture.');
  if (!viewport.isCurrent(expected)) fail('StaleCaptureError', 'The CAD view changed. Send the current view again.');
  const source = viewport.read();
  if (source.documentIdentity !== expected.documentIdentity || source.viewRevision !== expected.viewRevision) fail('StaleCaptureError', 'The CAD capture revision changed.');
  if (source.renderer.getContext().isContextLost()) fail('ContextLostError', 'The CAD graphics context is unavailable.');
  // Preserve framing; the UI offers aspect-locked dimensions with integer rounding.
  if (Math.abs(width / height - source.width / source.height) > 1 / Math.min(width, height)) fail('CaptureSizeError', 'Keep the CAD viewport aspect ratio when choosing capture dimensions.');
  let renderer: THREE.WebGLRenderer | undefined;
  try {
    const canvas = source.renderer.domElement.ownerDocument.createElement('canvas');
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    const gl = renderer.getContext(), max = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
    if (!gl.getContextAttributes()?.antialias) fail('CaptureReadbackError', 'Antialiased CAD capture is unavailable in this browser.');
    if (width > max || height > max) fail('CaptureSizeError', 'The capture exceeds the graphics device dimensions.');
    renderer.setPixelRatio(1); renderer.setSize(width, height, false); renderer.setClearColor(0, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = source.renderer.toneMapping; renderer.toneMappingExposure = source.renderer.toneMappingExposure;
    const scene = source.scene.clone(true), camera = source.camera.clone(), originals: THREE.Object3D[] = [], clones: THREE.Object3D[] = [];
    source.scene.traverse(object => originals.push(object)); scene.traverse(object => clones.push(object));
    for (const overlay of source.overlays) { const index = originals.indexOf(overlay); if (index >= 0) clones[index]!.visible = false; }
    scene.background = null; renderer.render(scene, camera);
    const raw = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR) fail('CaptureReadbackError', 'CAD pixel readback failed.');
    signal?.throwIfAborted(); if (!viewport.isCurrent(expected)) fail('StaleCaptureError', 'The CAD view changed during capture.');
    const rgba = new Uint8ClampedArray(raw.length);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const from = ((height - 1 - y) * width + x) * 4, to = (y * width + x) * 4, alpha = raw[from + 3]!; rgba[to + 3] = alpha;
      for (let c = 0; c < 3; c++) rgba[to + c] = alpha ? Math.round(raw[from + c]! * 255 / alpha) : 0;
    }
    return { width, height, rgba, colorSpace: 'srgb', alpha: 'straight', source: 'cad', stamp: { ...expected } };
  } catch (cause) {
    if (cause instanceof Error && ['CaptureSizeError','StaleCaptureError','ContextLostError','CaptureReadbackError','AbortError'].includes(cause.name)) throw cause;
    return fail('CaptureReadbackError', `CAD capture failed: ${cause instanceof Error ? cause.message : String(cause)}`);
  } finally { renderer?.dispose(); renderer?.forceContextLoss(); }
}
