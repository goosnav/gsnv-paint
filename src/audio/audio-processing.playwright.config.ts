import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
const webkit=process.env.AUDIO_BROWSER==='webkit';
export default defineConfig({
 outputDir:'/tmp/gsnv-consumer-qa/audio-processing-results',testDir:'.',testMatch:'audio-processing.browser.spec.ts',workers:1,reporter:'list',timeout:45000,
 use:{baseURL:'http://127.0.0.1:4186',browserName:webkit?'webkit':'chromium',...(!webkit?{channel:'chrome'}:{}),headless:true,viewport:{width:1280,height:720},trace:'retain-on-failure'},
 webServer:{cwd:fileURLToPath(new URL('../../',import.meta.url)),command:'npx vite preview --host 127.0.0.1 --port 4186',url:'http://127.0.0.1:4186',reuseExistingServer:false},
});
