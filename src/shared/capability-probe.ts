/**
 * PURPOSE    Inspect browser capabilities available to the current session.
 * KIND       SHELL
 * CONTRACT   IN: ProbeRequest with injected WindowLike and exact codec configurations.
 *            OUT: Promise<Capability[]>; each probe reports supported/unavailable/error,
 *            with a readable message; codec configurations are passed unchanged.
 *            RAISES: none; individual API exceptions become diagnostic results.
 * GUARANTEES No UA guesses, permissions prompts, uploads or document mutations.
 * TUNING     None; exact codec configuration requests are supplied by the caller.
 * DECISIONS  D1: Probe exact codecs only on request. Alternative: infer from browser
 *            identity; rejected because codec support varies by OS and configuration.
 *            Revisit if the browser exposes an equivalent exact capability registry.
 *            D2: Inspect permission-gated API presence without invoking user actions.
 *            Alternative: open pickers/read clipboard; rejected because a capability
 *            check must not prompt or expose private data. Revisit with explicit intent.
 * LIMITS     API presence does not prove permission or hardware support. Pressure needs
 *            a real pen test; codecs need encode/decode smoke beyond configuration probes.
 * TESTBENCH  src/shared/capability-probe.test.ts -- run with: node --import tsx --test src/shared/capability-probe.test.ts
 */

type WindowLike = {
  showOpenFilePicker?: unknown; showSaveFilePicker?: unknown; Worker?: unknown;
  WebAssembly?: Pick<typeof WebAssembly, 'compile'>;
  document?: { createElement(tag: 'canvas'): { getContext(id: 'webgl2'): unknown } };
  crossOriginIsolated?: boolean;
  navigator?: { clipboard?: { read?: unknown; write?: unknown } };
  PointerEvent?: { prototype: object };
  VideoEncoder?: Pick<typeof VideoEncoder, 'isConfigSupported'>;
  VideoDecoder?: Pick<typeof VideoDecoder, 'isConfigSupported'>;
  AudioEncoder?: Pick<typeof AudioEncoder, 'isConfigSupported'>;
  AudioDecoder?: Pick<typeof AudioDecoder, 'isConfigSupported'>;
};
type CodecRequest =
  | { id: string; kind: 'video-encoder'; config: VideoEncoderConfig }
  | { id: string; kind: 'video-decoder'; config: VideoDecoderConfig }
  | { id: string; kind: 'audio-encoder'; config: AudioEncoderConfig }
  | { id: string; kind: 'audio-decoder'; config: AudioDecoderConfig };
export type ProbeRequest = { environment: WindowLike; codecRequests: readonly CodecRequest[] };
export type Capability = { id: string; label: string; status: 'supported' | 'unavailable' | 'error'; message: string };

type Probe = { id: string; label: string; check: () => boolean | Promise<boolean>; available: string; unavailable: string };

async function inspect(probe: Probe): Promise<Capability> {
  try {
    const supported = await probe.check();
    return { id: probe.id, label: probe.label, status: supported ? 'supported' : 'unavailable',
      message: supported ? probe.available : probe.unavailable };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { id: probe.id, label: probe.label, status: 'error', message: `${probe.label} check failed: ${reason}` };
  }
}

async function codecSupported(environment: WindowLike, request: CodecRequest): Promise<boolean> {
  switch (request.kind) {
    case 'video-encoder': return (await environment.VideoEncoder?.isConfigSupported(request.config))?.supported === true;
    case 'video-decoder': return (await environment.VideoDecoder?.isConfigSupported(request.config))?.supported === true;
    case 'audio-encoder': return (await environment.AudioEncoder?.isConfigSupported(request.config))?.supported === true;
    case 'audio-decoder': return (await environment.AudioDecoder?.isConfigSupported(request.config))?.supported === true;
  }
}

export async function capabilityProbe({ environment, codecRequests }: ProbeRequest): Promise<Capability[]> {
  const probes: Probe[] = [
    { id: 'file-access', label: 'Native file pickers',
      check: () => typeof environment.showOpenFilePicker === 'function' && typeof environment.showSaveFilePicker === 'function',
      available: 'Native file pickers are available; access requires your file selection.',
      unavailable: 'Use file upload and download in this browser.' },
    { id: 'workers', label: 'Background workers', check: () => typeof environment.Worker === 'function',
      available: 'Background worker API is available.', unavailable: 'This browser cannot run background workers.' },
    { id: 'wasm', label: 'WebAssembly', check: async () => {
      if (!environment.WebAssembly?.compile) return false;
      await environment.WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
      return true;
    }, available: 'WebAssembly compilation is available.', unavailable: 'This browser cannot run WebAssembly.' },
    { id: 'webgl2', label: 'WebGL 2', check: () => {
      const context = environment.document?.createElement('canvas').getContext('webgl2') as
        { getExtension?: (name: string) => { loseContext?(): void } | null } | null | undefined;
      if (!context) return false;
      context.getExtension?.('WEBGL_lose_context')?.loseContext?.();
      return true;
    }, available: 'WebGL 2 context creation is available.', unavailable: 'WebGL 2 is unavailable. Check browser graphics settings.' },
    { id: 'cross-origin-isolation', label: 'Isolated execution', check: () => environment.crossOriginIsolated === true,
      available: 'Cross-origin isolation is active.', unavailable: 'Shared-memory workers need cross-origin isolation.' },
    { id: 'clipboard', label: 'Image clipboard', check: () => typeof environment.navigator?.clipboard?.read === 'function' &&
      typeof environment.navigator?.clipboard?.write === 'function',
      available: 'Image clipboard API is available; access may require permission.',
      unavailable: 'Use file open or drag and drop to import images.' },
    { id: 'pressure', label: 'Pen pressure API', check: () => !!environment.PointerEvent?.prototype && 'pressure' in environment.PointerEvent.prototype,
      available: 'Pressure API is available; pen hardware has not been tested.',
      unavailable: 'Pressure input is unavailable; use the tool size and opacity controls.' },
  ];
  for (const request of codecRequests) probes.push({
    id: `codec:${request.id}`, label: `Codec ${request.id}`, check: () => codecSupported(environment, request),
    available: 'This exact codec configuration is supported; media processing has not been tested.',
    unavailable: 'This browser does not support this exact codec configuration.',
  });
  return Promise.all(probes.map(inspect));
}
