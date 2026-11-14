import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'cad-revolve.browser.spec.ts',workers:1,reporter:'list',outputDir:'/tmp/gsnv-cad-revolve-results',use:{channel:'chrome',headless:true,viewport:{width:1280,height:720}}});
