import { test, expect } from '@playwright/test';

test('S08 actual browser recovery survives page close/reopen and reload with exact bytes', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/dev/fixtures/recovery-store.html');
  await expect(page.locator('#result')).toHaveText('{"ok":true,"value":null}');
  await page.getByLabel('Generation').fill('7');
  await page.getByRole('button', { name: 'Store generation', exact: true }).click();
  const expected = JSON.stringify({ ok: true, value: { workspace: 'cad', generation: 7, payload: [{ '0': 0, '1': 127, '2': 255 }], title: 'Recovery demonstration' } });
  await expect.poll(async () => JSON.parse(await page.locator('#result').innerText())).toEqual(JSON.parse(expected));
  await page.close();
  const reopened = await context.newPage();
  reopened.on('pageerror', error => errors.push(error.message));
  await reopened.goto('/dev/fixtures/recovery-store.html');
  await expect.poll(async () => {
    const text = await reopened.locator('#result').innerText();
    return text === 'Reading…' ? null : JSON.parse(text);
  }).toEqual(JSON.parse(expected));
  await reopened.reload();
  await expect.poll(async () => {
    const text = await reopened.locator('#result').innerText();
    return text === 'Reading…' ? null : JSON.parse(text);
  }).toEqual(JSON.parse(expected));
  const journal = await reopened.evaluate(() => Object.entries(localStorage));
  expect(journal).toHaveLength(1);
  expect(JSON.parse(journal[0]![1])).toEqual({ generation: 7, workspace: 'cad' });
  expect(errors).toEqual([]);
  console.log('S08: generation 7 and exact payload bytes survived page close/reopen and reload; journal contains metadata only.');
});
