import {audioExport} from './audio-export-profile.ts';
for(const p of audioExport.presets())console.log(`${p.label}: ${audioExport.describe(p.output)}`);
