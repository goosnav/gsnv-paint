import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'cad-modeling.browser.spec.ts',workers:1,reporter:'list',outputDir:'/tmp/gsnv-cad-modeling-results',use:{channel:'chrome',headless:true,viewport:{width:1280,height:720}}});
