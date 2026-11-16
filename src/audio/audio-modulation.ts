/**
 * PURPOSE    Render a modulation effect on a PCM channel.
 * KIND       CORE
 * CONTRACT   Finite Float32 channel <=128MiB/30min, integer rate 8..192kHz, AX01 flanger/phaser
 *            -> owned same-length finite channel. Invalid PCM/effect raises RangeError.
 * GUARANTEES Pure, deterministic, no input mutation. Disabled or zero mix is sample-exact dry.
 * TUNING     Four phaser all-pass stages; fractional flanger ring length covers base + depth.
 * DECISIONS  D1: Interpolated delay/all-pass DSP preserves preview/export behavior.
 *            Alternative: Web Audio nodes vary by browser. Revisit if: live performance is requested.
 * LIMITS     No appended tail, feedback only on flanger, stereo channels share sweep phase.
 * TESTBENCH  node --import tsx --test src/audio/audio-modulation.test.ts
 * DEMO       node --import tsx src/audio/audio-modulation.demo.ts
 */
import {audioSettings,type AudioEffect} from './audio-effect-settings.ts';
const STAGES=4;
export function modulateAudio(input:Float32Array,rate:number,raw:AudioEffect):Float32Array<ArrayBuffer> {
 if(!(input instanceof Float32Array)||!input.length||!Number.isInteger(rate)||rate<8000||rate>192000||input.byteLength>128*1024*1024||input.length>rate*1800)throw new RangeError('Modulation needs bounded PCM at 8000–192000 Hz.');
 for(const x of input)if(!Number.isFinite(x)||Math.abs(x)>1e6)throw new RangeError('Modulation contains invalid samples.');
 const e=audioSettings.chain([raw])[0]!;
 if(e.kind!=='flanger'&&e.kind!=='phaser')throw new RangeError('Choose flanger or phaser.');
 const v=e.values,mix=v.mix!/100,output=input.slice();if(!e.enabled||!mix)return output;
 const omega=2*Math.PI*v.speed!/rate;
 if(e.kind==='flanger'){
  const ring=new Float32Array(Math.ceil((v.delay!+v.depth!)*rate/1000)+2),feedback=v.feedback!/100;
  for(let i=0;i<input.length;i++){
   const delay=(v.delay!+v.depth!*(1+Math.sin(omega*i))/2)*rate/1000;
   // The minimum is below one sample at low rates; one sample prevents a noncausal feedback read.
   const read=(i%ring.length-Math.max(1,delay)+ring.length)%ring.length,left=Math.floor(read),fraction=read-left;
   const wet=ring[left]!*(1-fraction)+ring[(left+1)%ring.length]!*fraction,dry=input[i]!;
   ring[i%ring.length]=dry+feedback*wet;output[i]=dry*(1-mix)+wet*mix;
  }
 }else{
  const x1=new Float64Array(STAGES),y1=new Float64Array(STAGES);
  for(let i=0;i<input.length;i++){
   const frequency=Math.min(rate*.45,Math.max(20,v.center!*2**(v.depth!*.5*Math.sin(omega*i))));
   const tangent=Math.tan(Math.PI*frequency/rate),a=(tangent-1)/(tangent+1);let wet=input[i]!;
   for(let stage=0;stage<STAGES;stage++){const next=a*wet+x1[stage]!-a*y1[stage]!;x1[stage]=wet;y1[stage]=next;wet=next;}
   output[i]=input[i]!*(1-mix)+wet*mix;
  }
 }
 for(const x of output)if(!Number.isFinite(x)||Math.abs(x)>1e6)throw new RangeError('Modulation produced excessive levels. Reduce feedback or gain.');
 return output;
}
