import assert from 'node:assert/strict';
import test from 'node:test';
import { capabilityProbe, type ProbeRequest } from './capability-probe.ts';

const complete = (): ProbeRequest['environment'] => ({
  showOpenFilePicker() { throw new Error('Do not open a picker'); },
  showSaveFilePicker() { throw new Error('Do not open a picker'); }, Worker: class {}, WebAssembly,
  document: { createElement: () => ({ getContext: () => ({ getExtension: () => ({ loseContext() {} }) }) }) },
  crossOriginIsolated: true,
  navigator: { clipboard: { read() { throw new Error('Do not read clipboard'); }, write() { throw new Error('Do not write clipboard'); } } },
  PointerEvent: { prototype: { pressure: 0 } },
});
const ids = ['file-access', 'workers', 'wasm', 'webgl2', 'cross-origin-isolation', 'clipboard', 'pressure'];

test('S06 golden: missing APIs are unavailable, never silently supported', async () => {
  const result = await capabilityProbe({ environment: {}, codecRequests: [] });
  assert.deepEqual(result, [
    { id: 'file-access', label: 'Native file pickers', status: 'unavailable', message: 'Use file upload and download in this browser.' },
    { id: 'workers', label: 'Background workers', status: 'unavailable', message: 'This browser cannot run background workers.' },
    { id: 'wasm', label: 'WebAssembly', status: 'unavailable', message: 'This browser cannot run WebAssembly.' },
    { id: 'webgl2', label: 'WebGL 2', status: 'unavailable', message: 'WebGL 2 is unavailable. Check browser graphics settings.' },
    { id: 'cross-origin-isolation', label: 'Isolated execution', status: 'unavailable', message: 'Shared-memory workers need cross-origin isolation.' },
    { id: 'clipboard', label: 'Image clipboard', status: 'unavailable', message: 'Use file open or drag and drop to import images.' },
    { id: 'pressure', label: 'Pen pressure API', status: 'unavailable', message: 'Pressure input is unavailable; use the tool size and opacity controls.' },
  ]);
});

test('S06 recognizes present APIs without requesting files or clipboard data', async () => {
  const result = await capabilityProbe({ environment: complete(), codecRequests: [] });
  assert.deepEqual(result.map(item => item.id), ids);
  assert.ok(result.every(item => item.status === 'supported' && item.message.length > 0));
  assert.match(result.find(item => item.id === 'pressure')!.message, /hardware/i);
});

test('S06 partial picker/clipboard support and null WebGL context are unavailable', async () => {
  const result = await capabilityProbe({ environment: {
    showOpenFilePicker() {}, navigator: { clipboard: { read() {} } },
    document: { createElement: () => ({ getContext: () => null }) }, PointerEvent: { prototype: {} }, crossOriginIsolated: false,
  }, codecRequests: [] });
  assert.ok(result.every(item => item.status === 'unavailable'));
});

test('S06 isolates probe exceptions and releases the temporary WebGL context', async () => {
  let released = 0;
  const environment = complete();
  environment.document = { createElement: () => ({ getContext: () => ({ getExtension: (name: string) => {
    assert.equal(name, 'WEBGL_lose_context'); return { loseContext() { released++; } };
  } }) }) };
  Object.defineProperty(environment, 'showOpenFilePicker', { get() { throw new Error('Picker denied'); } });
  environment.WebAssembly = { compile: async () => { throw new Error('WASM blocked'); } };
  const result = await capabilityProbe({ environment, codecRequests: [] });
  assert.equal(result.find(item => item.id === 'file-access')?.status, 'error');
  assert.match(result.find(item => item.id === 'file-access')!.message, /Picker denied/);
  assert.equal(result.find(item => item.id === 'wasm')?.status, 'error');
  assert.equal(result.find(item => item.id === 'webgl2')?.status, 'supported');
  assert.equal(released, 1);
});

test('S06 exact codec configurations are passed unchanged and ordered as requested', async () => {
  const configs = [
    { codec: 'avc1.420028', width: 1920, height: 1080, framerate: 30 },
    { codec: 'vp8', codedWidth: 1920, codedHeight: 1080 },
    { codec: 'mp4a.40.2', numberOfChannels: 2, sampleRate: 48000, bitrate: 128000 },
    { codec: 'opus', numberOfChannels: 2, sampleRate: 48000 },
  ] as const;
  const seen: unknown[] = [];
  const probe = { isConfigSupported: async (config: object) => { seen.push(config); return { supported: true, config }; } };
  const environment = { ...complete(), VideoEncoder: probe, VideoDecoder: probe, AudioEncoder: probe, AudioDecoder: probe } as ProbeRequest['environment'];
  const codecRequests: ProbeRequest['codecRequests'] = [
    { id: 'h264', kind: 'video-encoder', config: configs[0] }, { id: 'vp8', kind: 'video-decoder', config: configs[1] },
    { id: 'aac', kind: 'audio-encoder', config: configs[2] }, { id: 'opus', kind: 'audio-decoder', config: configs[3] },
  ];
  const result = await capabilityProbe({ environment, codecRequests });
  assert.deepEqual(result.slice(7).map(item => [item.id, item.status]), [['codec:h264', 'supported'], ['codec:vp8', 'supported'], ['codec:aac', 'supported'], ['codec:opus', 'supported']]);
  assert.equal(seen.length, 4);
  for (let index = 0; index < seen.length; index++) assert.equal(seen[index], configs[index]);
});

test('S06 distinguishes unsupported codec, missing API and codec probe error', async () => {
  const environment = complete();
  environment.VideoEncoder = { isConfigSupported: async config => ({ supported: false, config }) };
  environment.AudioEncoder = { isConfigSupported: async () => { throw new TypeError('Invalid configuration'); } };
  const result = await capabilityProbe({ environment, codecRequests: [
    { id: 'unsupported', kind: 'video-encoder', config: { codec: 'unsupported', width: 1, height: 1 } },
    { id: 'missing', kind: 'video-decoder', config: { codec: 'vp8' } },
    { id: 'broken', kind: 'audio-encoder', config: { codec: 'aac', numberOfChannels: 2, sampleRate: 0 } },
  ] });
  assert.deepEqual(result.slice(7).map(item => item.status), ['unavailable', 'unavailable', 'error']);
  assert.match(result.at(-1)!.message, /Invalid configuration/);
});
