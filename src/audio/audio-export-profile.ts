/**
 * PURPOSE    Define honest audio export choices.
 * KIND       CORE
 * CONTRACT   Unknown settings -> owned AudioExport or RangeError for invalid keys/types/pairs.
 *            Presets, compatible rates, repair (rate only) and estimated size are owned outputs.
 * GUARANTEES Pure, deterministic. MP3 pairs preserve requested rate with pinned LAME in mono/stereo.
 * TUNING     RATES, BITRATES and PRESETS; compatible minimum bitrates derived from encoder matrix.
 * DECISIONS  D1: Restrict pairs to verified rates. Alternative: let encoder silently resample;
 *            that misreports exports. Revisit if: encoder changes or ABR/VBR is exposed.
 * LIMITS     CBR MP3 and PCM16/24 WAV. Size estimates exclude codec padding/metadata.
 * TESTBENCH  node --import tsx --test src/audio/audio-export-profile.test.ts
 * DEMO       node --import tsx src/audio/audio-export-profile.demo.ts
 */
const RATES = [8000,11025,12000,16000,22050,24000,32000,44100,48000] as const;
const BITRATES = [8,16,24,32,40,48,56,64,80,96,112,128,144,160,192,224,256,320] as const;
export type AudioExport = {
 format:'wav'|'mp3'; bits:16|24; sampleRate:typeof RATES[number];
 channels:'preserve'|'mono'; bitrate:typeof BITRATES[number]; preventClipping:boolean;
};
const DEFAULT:AudioExport={format:'wav',bits:16,sampleRate:44100,channels:'preserve',bitrate:192,preventClipping:true};
// Pinned LAME selects a lower rate below these thresholds; preserve must work for either input channel count.
const MINIMUM:Record<number,readonly [number,number]>={8000:[8,8],11025:[16,32],12000:[16,32],16000:[16,32],22050:[32,48],24000:[40,56],32000:[48,80],44100:[64,112],48000:[64,128]};
type Preset={id:string;label:string;description:string;output:AudioExport};
const mp3=(bitrate:AudioExport['bitrate'],sampleRate:AudioExport['sampleRate'],channels:AudioExport['channels']='preserve'):AudioExport=>({...DEFAULT,format:'mp3',bitrate,sampleRate,channels});
const PRESETS:Preset[]=[
 {id:'high',label:'High quality · 192 kbps',description:'Full-range music with few obvious compression artifacts.',output:mp3(192,44100)},
 {id:'standard',label:'Everyday music · 128 kbps',description:'A familiar balance of size and music quality.',output:mp3(128,44100)},
 {id:'small',label:'Small music file · 96 kbps',description:'Less high-frequency detail; a useful first step down.',output:mp3(96,32000)},
 {id:'web',label:'Early web · 64 kbps',description:'Start here for audible lossy texture. Try 48 or 32 kbps if you want a stronger effect.',output:mp3(64,22050)},
 {id:'portable',label:'Small portable · 48 kbps mono',description:'A small mono file with reduced detail; stereo width is removed.',output:mp3(48,22050,'mono')},
 {id:'phone',label:'Phone-sized · 32 kbps mono',description:'Noticeably compressed mono music. Compare this with Early web before going lower.',output:mp3(32,22050,'mono')},
 {id:'tiny24',label:'Tiny · 24 kbps mono',description:'Strong compression, narrowed frequency range and audible artifacts.',output:mp3(24,16000,'mono')},
 {id:'tiny16',label:'Very tiny · 16 kbps mono',description:'Severely reduced musical detail; useful for a deliberately damaged sound.',output:mp3(16,16000,'mono')},
 {id:'minimum',label:'Extreme · 8 kbps mono',description:'Speech-like bandwidth and heavy artifacts. Music loses substantial detail.',output:mp3(8,8000,'mono')},
 {id:'wav',label:'Uncompressed · WAV 16-bit',description:'Keep the processed samples without MP3 loss. Much larger files.',output:{...DEFAULT}},
];
function fields(raw:unknown):AudioExport {
 const keys=Object.keys(DEFAULT);
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==keys.length||keys.some(k=>!Object.hasOwn(raw,k)))throw new RangeError('Audio export settings contain missing or unknown fields.');
 const v=raw as AudioExport;
 if(!['wav','mp3'].includes(v.format)||![16,24].includes(v.bits)||!RATES.includes(v.sampleRate)||!BITRATES.includes(v.bitrate)||!['preserve','mono'].includes(v.channels)||typeof v.preventClipping!=='boolean')throw new RangeError('Choose valid WAV/MP3 export settings.');
 return {...v};
}
function compatibleRates(raw:unknown):AudioExport['sampleRate'][] {
 const v=fields(raw);
 return RATES.filter(rate=>v.format==='wav'||(v.bitrate>=MINIMUM[rate]![v.channels==='mono'?0:1]&&v.bitrate<=(rate<16000?64:rate<32000?160:320)&&!(rate>=32000&&v.bitrate===144)));
}
function validate(raw:unknown=DEFAULT):AudioExport {
 const v=fields(raw);
 if(!compatibleRates(v).includes(v.sampleRate))throw new RangeError(`MP3 ${v.bitrate} kbps needs a compatible sample rate: ${compatibleRates(v).join(', ')} Hz. Choose an export preset or a listed rate.`);
 return v;
}
function repair(raw:unknown) {
 const v=fields(raw),rates=compatibleRates(v);
 if(rates.includes(v.sampleRate))return {output:v,notice:''};
 const sampleRate=rates.filter(rate=>rate<=v.sampleRate).at(-1)??rates[0]!;
 return {output:{...v,sampleRate},notice:`Sample rate changed from ${v.sampleRate} to ${sampleRate} Hz to keep ${v.bitrate} kbps with these channels. Preview to hear the change.`};
}
function describe(raw:unknown):string {
 const v=validate(raw),kb=v.format==='mp3'?v.bitrate*7.5:v.sampleRate*v.bits/8*60/1000;
 const max=kb*(v.format==='wav'&&v.channels==='preserve'?2:1),mb=max>=1000,number=(x:number)=>mb?(x/1000).toFixed(2):String(Math.round(x));
 return `≈ ${number(kb)}${max!==kb?`–${number(max)}`:''} ${mb?'MB':'kB'}/min · ${v.format.toUpperCase()}${v.format==='mp3'?` ${v.bitrate} kbps`: ` ${v.bits}-bit`} · ${v.sampleRate} Hz · ${v.channels==='mono'?'mono':'keep mono / stereo'}`;
}
export const audioExport={validate,repair,compatibleRates,describe,rates:()=>[...RATES],bitrates:()=>[...BITRATES],presets:()=>structuredClone(PRESETS),
 preset(id:string):Preset{const p=PRESETS.find(p=>p.id===id);if(!p)throw new RangeError('Choose a known export preset.');return structuredClone(p);},
};
