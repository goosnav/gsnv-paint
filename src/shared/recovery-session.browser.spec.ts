import { test, expect } from '@playwright/test';

test('S14 actual recovery validates a native package across page close, reopen and reload', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/dev/fixtures/recovery-session.html');
  await expect(page.locator('#result')).toHaveText('{"ok":true,"value":null}');
  await page.getByLabel('Generation').fill('7');
  await page.getByRole('button', { name: 'Save sample recovery', exact: true }).click();
  const expected = { ok: true, value: {
    project: { format: 'gsnv-image', version: 1, id: 'recovery-demo', title: 'Red pixel sample', content: { width: 1, height: 1 } },
    assets: [{ id: 'rgba-0', mime: 'application/octet-stream', bytes: { '0': 255, '1': 0, '2': 0, '3': 255 } }],
  } };
  await expect.poll(async () => JSON.parse(await page.locator('#result').innerText())).toEqual(expected);
  await page.close();
  const reopened = await context.newPage(); reopened.on('pageerror', error => errors.push(error.message));
  await reopened.goto('/dev/fixtures/recovery-session.html');
  await expect.poll(async () => {
    const text = await reopened.locator('#result').innerText(); return text === 'Reading…' ? null : JSON.parse(text);
  }).toEqual(expected);
  await expect(reopened.locator('#observed')).toHaveText('Highest observed generation: 7');
  await reopened.reload();
  await expect.poll(async () => {
    const text = await reopened.locator('#result').innerText(); return text === 'Reading…' ? null : JSON.parse(text);
  }).toEqual(expected);
  await reopened.getByLabel('Title').fill('Stale attempted package');
  await reopened.getByLabel('Generation').fill('6');
  await reopened.getByRole('button', { name: 'Save sample recovery', exact: true }).click();
  await expect(reopened.locator('#completed')).toHaveText('Completed operations: 2');
  await expect.poll(async () => JSON.parse(await reopened.locator('#result').innerText())).toEqual(expected);
  expect(await reopened.evaluate(() => Object.entries(localStorage))).toEqual([
    ['gsnv-paint:recovery:image', '{"generation":7,"workspace":"image"}'],
  ]);
  await reopened.getByRole('button', { name: 'Discard sample recovery', exact: true }).click();
  await expect(reopened.locator('#result')).toHaveText('{"ok":true,"value":null}');
  await reopened.reload();
  await expect(reopened.locator('#result')).toHaveText('{"ok":true,"value":null}');
  expect(await reopened.evaluate(() => Object.entries(localStorage))).toEqual([]);
  expect(errors).toEqual([]);
  console.log('S14: exact metadata and RGBA bytes survived page close/reopen and reload; stale generation 6 returned committed generation 7; discard persisted.');
});
