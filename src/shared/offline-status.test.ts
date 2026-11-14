import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { mountOfflineStatus } from './offline-status.ts';
import type { OfflineState } from './offline-client.ts';
const initial: OfflineState = { phase: 'checking', pageBuild: 'a'.repeat(64), completedBytes: 0, totalBytes: 0, update: 'none' };
function fixture() {
  const dom = new JSDOM('<!doctype html><textarea></textarea><footer><div id="slot"></div></footer>');
  const document = dom.window.document, root = document.querySelector<HTMLElement>('#slot')!;
  let retries = 0, checks = 0;
  const status = mountOfflineStatus({ root, onRetry: () => { retries++; }, onCheck: () => { checks++; } });
  return { dom, root, document, status, retries: () => retries, checks: () => checks };
}

test('S21 uses stable accessible details and does not disturb typing focus', () => {
  const f = fixture(), textarea = f.document.querySelector('textarea')!; textarea.focus();
  f.status.update({ ...initial, phase: 'installing', completedBytes: 5, totalBytes: 10 });
  const details = f.root.querySelector('details')!, summary = f.root.querySelector('summary')!, progress = f.root.querySelector('progress')!;
  assert.equal(summary.textContent, 'Preparing offline…'); assert.equal(progress.value, 5); assert.equal(progress.max, 10); assert.equal(details.open, false);
  f.status.update({ ...initial, phase: 'ready', readyBuild: initial.pageBuild });
  assert.equal(f.root.querySelector('summary'), summary); assert.equal(summary.textContent, 'Ready offline'); assert.equal(f.document.activeElement, textarea);
  details.open = true; f.root.querySelector('button')!.focus();
  details.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(details.open, false); assert.equal(f.document.activeElement, summary); f.status.dispose(); f.dom.window.close();
});

test('S21 reports candidate failure separately and renders error strings as text', () => {
  const f = fixture(); f.status.update({ ...initial, phase: 'ready', readyBuild: initial.pageBuild, update: 'error', error: { code: 'offline.network', message: '<img src=x onerror=alert(1)> Reconnect and retry.' } });
  assert.equal(f.root.querySelector('summary')!.textContent, 'Ready offline'); assert.equal(f.root.querySelector('img'), null);
  assert.match(f.root.textContent!, /current offline copy remains ready/); assert.match(f.root.textContent!, /Reconnect and retry/);
  const retry = [...f.root.querySelectorAll('button')].find(button => button.textContent === 'Retry offline setup')!;
  retry.click(); assert.equal(f.retries(), 1);
  f.status.update({ ...initial, phase: 'ready', update: 'ready' }); assert.match(f.root.textContent!, /Save your work, close all gsnv-paint tabs, and reopen/);
  assert.equal(retry.hidden, true); assert.equal(f.root.querySelectorAll('button').length, 2); f.status.dispose(); f.dom.window.close();
});

test('S21 bounds progress announcements and disables repeated installation actions', t => {
  const f = fixture(); let time = 1000; t.mock.method(Date, 'now', () => time);
  f.status.update({ ...initial, phase: 'installing', completedBytes: 1, totalBytes: 100 });
  const live = f.root.querySelector('[aria-live]')!, previous = live.textContent;
  time = 1200; f.status.update({ ...initial, phase: 'installing', completedBytes: 60, totalBytes: 100 }); assert.equal(live.textContent, previous);
  assert.ok([...f.root.querySelectorAll('button')].every(button => button.disabled));
  time = 2200; f.status.update({ ...initial, phase: 'installing', completedBytes: 90, totalBytes: 100 }); assert.notEqual(live.textContent, previous);
  f.status.update({ ...initial, phase: 'ready' }); f.root.querySelectorAll('button')[1]!.click(); assert.equal(f.checks(), 1); f.status.dispose(); f.dom.window.close();
});

test('S21 rejects missing ports and disposal leaves no active controls', () => {
  assert.throws(() => mountOfflineStatus({ root: null as unknown as HTMLElement, onRetry() {}, onCheck() {} }), TypeError);
  const f = fixture(); assert.throws(() => mountOfflineStatus({ root: f.root, onRetry: null as unknown as () => void, onCheck() {} }), TypeError);
  const button = f.root.querySelectorAll('button')[1]!; f.status.update({ ...initial, phase: 'ready' }); f.status.dispose(); button.click();
  f.status.update({ ...initial, phase: 'error' }); assert.equal(f.root.childElementCount, 0); assert.equal(f.checks(), 0); f.dom.window.close();
});

test('S21 makes an action failure visible and announces the recovery instruction', () => {
  const f = fixture(); f.status.dispose();
  const status = mountOfflineStatus({ root: f.root, onRetry() {}, onCheck() { throw new Error('browser failure'); } });
  status.update({ ...initial, phase: 'ready' }); f.root.querySelectorAll('button')[1]!.click();
  const problem = f.root.querySelector<HTMLElement>('.gc-offline-error')!;
  assert.equal(problem.hidden, false); assert.match(problem.textContent!, /could not start. Try again/);
  assert.equal(f.root.querySelector('[aria-live]')!.textContent, problem.textContent);
  status.dispose(); f.dom.window.close();
});
