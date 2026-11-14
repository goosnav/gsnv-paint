import { test } from 'node:test'; import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { recentProjects } from './recent-projects.ts';

test('S16 recent projects retain every stored project beyond 12 until explicit removal', async () => {
  const recent = recentProjects(new IDBFactory());
  await recent.save({ id: 'a', workspace: 'cad', title: 'Bracket', updated: 1, parts: [new Uint8Array([1, 2])] });
  await recent.save({ id: 'b', workspace: 'image', title: 'Sketch', updated: 5, parts: [new Uint8Array([3])] });
  await recent.save({ id: 'a', workspace: 'cad', title: 'Bracket v2', updated: 9, parts: [new Uint8Array([4]), new Uint8Array([5])] });
  assert.deepEqual(await recent.list(), [{ id: 'a', workspace: 'cad', title: 'Bracket v2', updated: 9 }, { id: 'b', workspace: 'image', title: 'Sketch', updated: 5 }]);
  assert.deepEqual((await recent.load('a')).map(p => [...p]), [[4], [5]]);
  for (let i = 0; i < 14; i++) await recent.save({ id: `p${i}`, workspace: 'photo', title: `P${i}`, updated: 100 + i, parts: [new Uint8Array([i])] });
  const list = await recent.list(); assert.equal(list.length, 16); assert.equal(list[0]!.id, 'p13'); assert.ok(list.some(e => e.id === 'a'));
  assert.deepEqual((await recent.load('a')).map(p => [...p]), [[4], [5]], 'the only stored copy survives newer projects');
  await recent.remove('p13'); assert.equal((await recent.list())[0]!.id, 'p12');
  await assert.rejects(recent.load('p13'), /no longer stored/);
  await assert.rejects(recent.save({ id: '', workspace: 'cad', title: '', updated: 1, parts: [new Uint8Array(1)] }), /Invalid/);
  await recent.clear(); assert.deepEqual(await recent.list(), []);
  await assert.rejects(recentProjects(undefined).list(), /unavailable/);
});
