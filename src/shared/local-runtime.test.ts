import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { localRuntime, mountLocalRuntime } from './local-runtime.ts';

const buildId = 'a'.repeat(64), revision = '0f722d2';
function fixture(url = `http://127.0.0.1:24173/__gsnv-local__/start/${buildId}`) {
  const dom = new JSDOM('<!doctype html><head></head><body><textarea></textarea><footer></footer></body>', { url });
  const document = dom.window.document;
  for (const [name, content] of [['gsnv-build-id', buildId], ['gsnv-local-runtime', '1'], ['gsnv-local-revision', revision]]) {
    const meta = document.createElement('meta'); meta.name = name!; meta.content = content!; document.head.append(meta);
  }
  return { dom, document, root: document.querySelector('footer')!, read: () => localRuntime({ document, location: dom.window.location }) };
}

test('LOCAL-RUNTIME accepts only marked HTTP loopback launch pages whose build identity matches the route', () => {
  for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
    const f = fixture(`http://${host}:24173/__gsnv-local__/start/${buildId}`);
    assert.deepEqual(f.read(), { buildId, revision }); assert.ok(Object.isFrozen(f.read())); f.dom.window.close();
  }
  const f = fixture();
  for (const value of ['0f722d2-dirty', 'source-ab12cd34ef56']) {
    f.document.querySelector<HTMLMetaElement>('meta[name="gsnv-local-revision"]')!.content = value;
    assert.equal(f.read()?.revision, value);
  }
  f.dom.window.close();
});

test('LOCAL-RUNTIME leaves ordinary localhost, development paths, HTTPS and cloud pages on the normal runtime path', () => {
  for (const url of [
    'http://127.0.0.1:24173/', 'http://localhost:5173/', 'http://localhost:5173/src/app/main.ts',
    `https://127.0.0.1/__gsnv-local__/start/${buildId}`, `https://paint.goosnav.example/__gsnv-local__/start/${buildId}`,
    `http://localhost.example/__gsnv-local__/start/${buildId}`, `http://192.168.1.2/__gsnv-local__/start/${buildId}`,
    `http://127.0.0.1/__gsnv-local__/start/${'b'.repeat(64)}`, `http://127.0.0.1/__gsnv-local__/start/${buildId}/`,
  ]) { const f = fixture(url); assert.equal(f.read(), null, url); f.dom.window.close(); }
});

test('LOCAL-RUNTIME rejects missing, duplicated, unmarked or malformed metadata without changing the document', () => {
  for (const name of ['gsnv-build-id', 'gsnv-local-runtime', 'gsnv-local-revision']) {
    const f = fixture(), meta = f.document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)!;
    meta.remove(); assert.equal(f.read(), null); f.document.head.append(meta, meta.cloneNode()); assert.equal(f.read(), null); f.dom.window.close();
  }
  for (const [name, value] of [['gsnv-local-runtime', 'true'], ['gsnv-local-runtime', ''], ['gsnv-build-id', 'a'.repeat(63)],
    ['gsnv-build-id', 'A'.repeat(64)], ['gsnv-local-revision', ''], ['gsnv-local-revision', 'a'.repeat(65)], ['gsnv-local-revision', '<img src=x>']]) {
    const f = fixture(); f.document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)!.content = value!;
    const before = f.document.documentElement.outerHTML; assert.equal(f.read(), null); assert.equal(f.document.documentElement.outerHTML, before); f.dom.window.close();
  }
});

test('LOCAL-RUNTIME provides a compact accessible status without stealing focus or presenting offline downloads', () => {
  const f = fixture(), editor = f.document.querySelector('textarea')!; editor.focus(); editor.value = 'Unsaved notes';
  const status = mountLocalRuntime({ root: f.root, runtime: f.read()! });
  const details = f.root.querySelector('details')!, summary = f.root.querySelector('summary')!;
  assert.equal(summary.textContent, `Local · ${revision}`); assert.match(summary.title, /same workspaces and engines/);
  assert.equal(details.open, false); assert.equal(f.document.activeElement, editor); assert.equal(editor.value, 'Unsaved notes');
  assert.equal(f.root.querySelector('[role="group"]')?.getAttribute('aria-label'), 'Local application');
  assert.match(f.root.textContent!, /processes projects on this computer/); assert.match(f.root.textContent!, /Keep the launcher window open/);
  assert.equal(f.root.querySelector('button,progress'), null);
  details.open = true; details.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(details.open, false); assert.equal(f.document.activeElement, summary);
  status.dispose(); status.dispose(); assert.equal(f.root.childElementCount, 0);
  details.open = true; details.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(details.open, true, 'disposal removes keyboard handlers'); f.dom.window.close();
});

test('LOCAL-RUNTIME status rejects missing DOM ports and malformed identities', () => {
  const f = fixture();
  assert.throws(() => mountLocalRuntime({ root: null as unknown as HTMLElement, runtime: { buildId, revision } }), TypeError);
  assert.throws(() => mountLocalRuntime({ root: f.root, runtime: { buildId: 'old', revision } }), TypeError);
  assert.throws(() => mountLocalRuntime({ root: f.root, runtime: { buildId, revision: '<b>fake</b>' } }), TypeError);
  assert.equal(f.root.childElementCount, 0); f.dom.window.close();
});
