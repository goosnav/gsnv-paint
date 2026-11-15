import { test, expect } from '@playwright/test';

test('S10 XP-inspired web shell fits 1280×720 and preserves focus, menus and workspace content', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/dev/fixtures/chrome.html');
  await expect(page.locator('[data-window-title]')).toHaveText('Untitled');
  const viewport = page.getByRole('region', { name: 'CAD workspace view', exact: true });
  const rect = await viewport.boundingBox();
  expect(rect!.width).toBeGreaterThan(700); expect(rect!.height).toBeGreaterThan(450);
  expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth && document.body.scrollHeight <= innerHeight)).toBe(true);
  await expect(page.getByRole('toolbar', { name: 'Tool palette', exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Panels', exact: true })).toBeVisible();
  const hand = page.getByRole('button', { name: 'Hand (Space)', exact: true });
  await expect(hand).toHaveAttribute('title', 'Hand (Space)'); await hand.focus();
  await expect(page.getByRole('status')).toHaveText('Drag to pan the view.');
  const file = page.getByRole('menuitem', { name: 'File', exact: true });
  await file.focus(); await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Open (Ctrl+O)', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(file).toBeFocused();
  await file.click(); await page.getByRole('menuitem', { name: 'Open (Ctrl+O)', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Command received: file.open.');
  await file.click(); await viewport.click({ position: { x: 350, y: 220 } });
  await expect(file).toHaveAttribute('aria-expanded', 'false');
  await viewport.evaluate(node => { node.setAttribute('data-retained', 'yes'); });
  await page.getByRole('tab', { name: 'Image', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Layers', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Image workspace view', exact: true })).toHaveAttribute('data-retained', 'yes');
  await page.getByRole('tab', { name: 'CAD', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('CAD workspace selected.');
  await page.screenshot({ path: 'dev/evidence/S10-web-shell.png' });
  await testInfo.attach('web-shell-1280x720', { path: 'dev/evidence/S10-web-shell.png', contentType: 'image/png' });
  await page.evaluate(async () => {
    const modulePath = '/src/shared/chrome.ts';
    const { createChrome } = await import(modulePath);
    const root = document.querySelector<HTMLElement>('#app')!; root.replaceChildren();
    const input = document.createElement('input'); input.setAttribute('aria-label', 'Panel value'); input.value = 'Width';
    const model = { title: 'Focus regression', workspace: 'cad', dirty: false, status: 'Ready', tools: [], capabilities: [],
      menus: [{ id: 'file', label: 'File', items: [{ id: 'open', label: 'Open', shortcut: 'Ctrl+O', enabled: true }] },
        { id: 'edit', label: 'Edit', items: [{ id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', enabled: true }] }],
      panels: [{ id: 'properties', title: 'Properties', content: input }] };
    const handle = createChrome({ root, model, onCommand: () => {}, onWorkspace: () => {} });
    root.addEventListener('fixture-update', () => handle.update({ ...model, status: 'Autosaved' }));
  });
  const regressionFile = page.getByRole('menuitem', { name: 'File', exact: true });
  await regressionFile.focus(); await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Open (Ctrl+O)', exact: true })).toBeFocused();
  await page.locator('#app').dispatchEvent('fixture-update'); // A background update keeps the open menu and focused command.
  await expect(page.getByRole('menuitem', { name: 'Open (Ctrl+O)', exact: true })).toBeFocused();
  await expect(regressionFile).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Tab');
  await expect(regressionFile).toHaveAttribute('aria-expanded', 'false');
  const input = page.getByRole('textbox', { name: 'Panel value', exact: true });
  await regressionFile.focus(); await page.keyboard.press('ArrowDown'); await input.focus();
  await page.keyboard.press('ArrowLeft'); await expect(input).toBeFocused();
  await expect(regressionFile).toHaveAttribute('aria-expanded', 'false');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Video', exact: true }).focus();
  await expect(page.getByRole('tab', { name: 'Video', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(input).toBeVisible();
  expect(errors).toEqual([]);
});

test('PU-01 opaque menus cover disabled toolbar icons and keep click ownership', async ({ page }) => {
  await page.goto('/dev/fixtures/chrome.html');
  await page.evaluate(async () => {
    const modulePath = '/src/shared/chrome.ts'; const { createChrome } = await import(modulePath);
    const root = document.querySelector<HTMLElement>('#app')!; root.replaceChildren();
    const model = { title: 'Menu layering', workspace: 'image', dirty: false, status: 'Ready', tools: [], capabilities: [], panels: [], menus: [
      { id: 'layer', label: 'Layer', items: [{ id: 'add', label: 'New layer', shortcut:'', enabled: true }] },
      { id: 'edit', label: 'Edit', items: Array.from({length:8},(_,i)=>({id:`undo-${i}`,label:'Undo',shortcut:'',icon:'undo',toolbar:true,enabled:false})) },
    ] };
    createChrome({ root, model, onCommand: (id:string) => { root.dataset.received = id; root.dataset.count = String(Number(root.dataset.count ?? 0)+1); }, onWorkspace() {} });
  });
  await page.getByRole('menuitem', { name:'Layer',exact:true }).click();
  const popup=page.locator('.gc-menu-popup:not([hidden])'); const rect=(await popup.boundingBox())!;
  const png=await page.screenshot({clip:{x:rect.x+125,y:rect.y+3,width:75,height:17}});
  const colours=await page.evaluate(async bytes=>{
    const img=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d')!;ctx.drawImage(img,0,0);img.close();
    const d=ctx.getImageData(0,0,c.width,c.height).data;let nonWhite=0;for(let i=0;i<d.length;i+=4)if(d[i]!==255||d[i+1]!==255||d[i+2]!==255)nonWhite++;return nonWhite;
  },[...png]);
  expect(colours).toBe(0);
  await page.mouse.click(rect.x+170,rect.y+10);
  await expect(page.locator('#app')).toHaveAttribute('data-received','add');
  await expect(page.locator('#app')).toHaveAttribute('data-count','1');
});
