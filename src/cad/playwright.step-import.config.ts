import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'.',testMatch:'cad-step-import.browser.spec.ts',outputDir:'../../test-results/step-import',workers:1,reporter:'list',
  use:{channel:'chrome',headless:true,viewport:{width:1280,height:720}},
});
