import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync, crc32 } from 'node:zlib';
import { encodePng } from './png-encode.ts';
test('D05 PNG independently decodes exact straight RGBA including low and zero alpha', async () => {
  const rgba = new Uint8ClampedArray([17,83,249,0, 1,99,207,1, 24,51,81,2, 253,104,9,127, 51,202,188,128, 17,37,111,254]);
  const png = await encodePng({ width: 3, height: 2, rgba, colorSpace: 'srgb', alpha: 'straight' });
  assert.deepEqual([...png.subarray(0,8)], [137,80,78,71,13,10,26,10]);
  let offset = 8; const compressed: Uint8Array[] = [], types: string[] = [];
  while (offset < png.length) {
    const view = new DataView(png.buffer, png.byteOffset + offset), len = view.getUint32(0), type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8)); types.push(type);
    assert.equal(view.getUint32(8 + len), crc32(png.subarray(offset + 4, offset + 8 + len)), `${type} CRC`);
    const bytes = png.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') assert.deepEqual([...bytes], [0,0,0,3,0,0,0,2,8,6,0,0,0]);
    if (type === 'IDAT') compressed.push(bytes); offset += 12 + len;
  }
  assert.deepEqual(types, ['IHDR','sRGB','IDAT','IEND']);
  const raw = inflateSync(Buffer.concat(compressed)); assert.equal(raw.length, 26);
  assert.deepEqual([...raw], [0,...rgba.subarray(0,12),0,...rgba.subarray(12)]);
});
test('D05 PNG checks dimensions and cancellation before encoding', async () => {
  const pixels = { width: 1, height: 1, rgba: new Uint8ClampedArray(4), colorSpace: 'srgb' as const, alpha: 'straight' as const };
  await assert.rejects(encodePng({ ...pixels, width: 16_777_217 }));
  const stop = new AbortController(); stop.abort(); await assert.rejects(encodePng(pixels, stop.signal), { name: 'AbortError' });
});
