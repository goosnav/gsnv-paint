import { nativeContainer } from './native-container.ts';

// Demonstration only; correctness is gated by native-container.test.ts.
const sample = {
  project: { format: 'gsnv-image' as const, version: 1 as const, id: 'pixel-example', title: 'One red pixel', content: { width: 1, height: 1, tile: 'rgba-0' } },
  assets: [{ id: 'rgba-0', mime: 'application/octet-stream', bytes: new Uint8Array([255, 0, 0, 255]) }],
};
const encoded = nativeContainer({ op: 'encode', package: sample });
const reopened = nativeContainer({ op: 'decode', parts: encoded.parts });
console.log(`GSNVPK1: ${encoded.byteLength} bytes in ${encoded.parts.length} parts`);
console.log(`Reopened ${reopened.project.title}: ${reopened.assets[0]!.id} = [${reopened.assets[0]!.bytes.join(', ')}]`);
