import{defineConfig}from'@playwright/test';
export default defineConfig({testDir:'../src',testMatch:['**/image-upgrade.browser.spec.ts','**/image-batch.browser.spec.ts','**/image-automation.browser.spec.ts','**/image-upgrade-visual.browser.spec.ts'],grepInvert:/real browser filesystem/,workers:1,reporter:'list',use:{browserName:'webkit',headless:true,viewport:{width:1280,height:720}}});
