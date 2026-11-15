import test from 'node:test';
import assert from 'node:assert/strict';
import { pixelStroke } from './pixel-stroke.ts';
const cov = (width: number, height: number) => ({ width, height, data: new Float32Array(width * height) });
const rows = (c: ReturnType<typeof cov>) => Array.from({ length: c.height }, (_, y) => [...c.data.slice(y * c.width, (y + 1) * c.width)].join(''));
test('I62 round and square stamps have binary coverage and exact hard boundaries', () => {
  const c = cov(5, 5); pixelStroke({ cov: c, points: [[2, 2]], size: 5, pixelSize: 1, tip: 'round' });
  assert.deepEqual(rows(c), ['01110', '11111', '11111', '11111', '01110']);
  pixelStroke({ cov: c, points: [[2, 2]], size: 5, pixelSize: 1, tip: 'square' }); assert.ok(c.data.every(v => v === 1));
});
test('I62 one-pixel diagonals connect sparse input without fractional coverage', () => {
  const c = cov(9, 7); pixelStroke({ cov: c, points: [[1.9, 1.1], [7.2, 5.9]], size: 1, pixelSize: 1, tip: 'round' });
  assert.deepEqual(rows(c), ['000000000', '010000000', '001100000', '000010000', '000001100', '000000010', '000000000']);
});
test('I62 coarse pixels align to the origin, keep partial canvas-edge blocks and clip outside', () => {
  const c = cov(10, 7); assert.deepEqual(pixelStroke({ cov: c, points: [[9.9, 6.9]], size: 1, pixelSize: 4, tip: 'round' }), { x: 8, y: 4, width: 2, height: 3 });
  assert.deepEqual(rows(c), ['0000000000', '0000000000', '0000000000', '0000000000', '0000000011', '0000000011', '0000000011']);
  const before = c.data.slice(); assert.equal(pixelStroke({ cov: c, points: [[-20, -20], [-10, -10]], size: 1, pixelSize: 4, tip: 'round' }), null); assert.deepEqual(c.data, before);
});
test('I62 distant endpoints traverse only the clipped canvas and repeated strokes stay binary', () => {
  const c = cov(12, 8), request = { cov: c, points: [[-1e8, 3], [1e8, 3]] as const, size: 1, pixelSize: 1, tip: 'round' as const };
  pixelStroke(request); pixelStroke(request); assert.equal(rows(c)[3], '111111111111'); assert.equal(c.data.reduce((a,b) => a+b), 12);
});
test('I62 rejects invalid inputs before mutation', () => {
  const c = cov(8, 8), request = { cov: c, points: [[1, 1]] as const, size: 4, pixelSize: 1, tip: 'round' as const };
  for (const patch of [{ size: 0 }, { size: 501 }, { pixelSize: 0 }, { pixelSize: 33 }, { pixelSize: 1.5 }, { points: [] }, { points: [[NaN, 0]] }, { points: [[1e10, 0]] }, { tip: 'bad' }, { cov: { ...c, width: 9 } }]) {
    assert.throws(() => pixelStroke({ ...request, ...patch } as any), RangeError); assert.ok(c.data.every(v => v === 0));
  }
});
