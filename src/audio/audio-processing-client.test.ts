import {test} from 'node:test';import assert from 'node:assert/strict';
import {createAudioProcessor} from './audio-processing-client.ts';
test('AX04 client abort/termination/errors and transferred PCM',async()=>{
 let terminated=0,sent:unknown;
 const worker={onmessage:null as ((e:MessageEvent)=>void)|null,onerror:null as ((e:ErrorEvent)=>void)|null,terminate(){terminated++;},postMessage(job:unknown){sent=job;}};
 const client=createAudioProcessor({worker:async()=>worker as unknown as Worker}); const abort=new AbortController();
 const running=client.run({pcm:{sampleRate:48000,channels:[Float32Array.of(0)]},chain:[]},abort.signal); await new Promise(r=>setTimeout(r,0)); assert.ok(sent); abort.abort(); await assert.rejects(running,{name:'AbortError'});assert.equal(terminated,1);
 const done=client.run({pcm:{sampleRate:48000,channels:[Float32Array.of(0)]},chain:[]},new AbortController().signal);await new Promise(r=>setTimeout(r,0)); worker.onmessage!({data:{ok:false,error:'bad audio'}} as MessageEvent);await assert.rejects(done,/bad audio/); assert.equal(terminated,2);
 client.dispose();await assert.rejects(client.run({pcm:{sampleRate:48000,channels:[Float32Array.of(0)]},chain:[]},new AbortController().signal),/closed/);
});
