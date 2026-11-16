import {test} from 'node:test'; import assert from 'node:assert/strict';
import {bindAudioProcessor} from './audio-processing.worker.ts';
import {audioSettings} from './audio-effect-settings.ts';
test('AX04 worker dispatches actual DSP/encoder and readable errors',()=>{
 const replies: any[]=[]; const port={onmessage:null as ((e:MessageEvent)=>void)|null,postMessage:(v:unknown)=>replies.push(v)}; bindAudioProcessor(port);
 port.onmessage!({data:{pcm:{sampleRate:44100,channels:[Float32Array.of(.5,0,-.5)]},chain:[]}} as MessageEvent);
 assert.deepEqual([...replies.at(-1).pcm.channels[0]],[.5,0,-.5]);
 port.onmessage!({data:{pcm:{sampleRate:44100,channels:[Float32Array.of(.5,0,-.5)]},chain:[],output:audioSettings.output()}} as MessageEvent); assert.equal(replies.at(-1).encoded.mime,'audio/wav');
 port.onmessage!({data:null} as MessageEvent); assert.equal(replies.at(-1).ok,false); assert.match(replies.at(-1).error,/audio|request|read/i);
});
