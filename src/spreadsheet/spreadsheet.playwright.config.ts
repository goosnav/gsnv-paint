import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'spreadsheet-workspace.browser.spec.ts',outputDir:'/tmp/gsnv-consumer-qa/spreadsheet-browser-results',workers:1,reporter:'list',use:{channel:'chrome',headless:true,viewport:{width:1280,height:720}}});
