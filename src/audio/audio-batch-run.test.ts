import {test} from 'node:test';import assert from 'node:assert/strict';
import {runAudioBatch} from './audio-batch-run.ts';import {audioSettings} from './audio-effect-settings.ts';
import type {BatchSelection,BatchDestination} from '../image/image-batch-files.ts';
function fixture(names=['song.wav','song.mp3','broken.wav']){
 const writes=new Map<string,Blob>();let cancelled=false;
 const selection:BatchSelection={kind:'files',ignored:0,inputs:names.map(name=>({name,size:1,lastModified:1,read:async()=>new File(['a'],name)}))};
 const destination:BatchDestination={kind:'directory',name:'timestamped',write:async(n,b)=>{writes.set(n,b);},finish:async()=>({kind:'directory',name:'timestamped',written:writes.size}),cancel:async()=>{cancelled=true;}};
 return{selection,destination,writes,get cancelled(){return cancelled;}};
}
test('AX06 sequential batch skips bad input, resolves output collisions and records recipe',async()=>{
 const f=fixture();let active=0;const result=await runAudioBatch({...f,chain:audioSettings.preset('retro'),output:audioSettings.output(),signal:new AbortController().signal,progress(){},process:async file=>{assert.equal(active++,0);await Promise.resolve();active--;if(file.name==='broken.wav')throw new Error('bad codec');return new Blob(['processed']);}});
 assert.equal(result.status,'completed');assert.equal(result.written,2);assert.deepEqual([...f.writes.keys()],['song.wav','song-2.wav','audio-batch-report.json']);assert.equal(result.entries[2]!.status,'error');
 const report=JSON.parse(await f.writes.get('audio-batch-report.json')!.text());assert.equal(report.chain[0].kind,'lowpass');assert.equal(report.entries.length,3);
});
test('AX06 cancel after processing prevents write; output failure stops remaining files',async()=>{
 const f=fixture(),cancel=new AbortController(); const stopped=await runAudioBatch({...f,chain:[],output:audioSettings.output(),signal:cancel.signal,progress(){},process:async()=>{cancel.abort();return new Blob(['x']);}});assert.equal(stopped.status,'stopped');assert.equal(f.writes.size,0);assert.ok(f.cancelled);
 const g=fixture();let count=0;g.destination.write=async()=>{throw new Error('disk full');};const failed=await runAudioBatch({...g,chain:[],output:audioSettings.output(),signal:new AbortController().signal,progress(){},process:async()=>{count++;return new Blob();}});assert.equal(failed.status,'failed');assert.equal(count,1);assert.match(failed.error!,/disk full/);
});
