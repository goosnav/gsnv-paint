import { test } from 'node:test';
import assert from 'node:assert/strict';
import { videoSource } from './video-source-adapter.ts';
import { videoTimeline } from '../video/video-timeline.ts';
test('D03 rejects missing frames, stale revisions and aborted work without touching browser resources', async () => {
  const source = { workspace: 'video' as const, documentId: 'video', identity: 'r1', epoch: 1, viewRevision: 't1' };
  const request = { document: {} as Document, value: videoTimeline({ operation: 'new' }), time: 0, source, label: 'Frame', isCurrent: () => true };
  await assert.rejects(videoSource(request), { name: 'BridgeFrameReadbackError' });
  await assert.rejects(videoSource({ ...request, isCurrent: () => false }), { name: 'BridgeFrameRevisionError' });
  const abort = new AbortController(); abort.abort(); await assert.rejects(videoSource({ ...request, signal: abort.signal }), { name: 'AbortError' });
});
test('D03 accepts ready bounded seeks with unknown positive duration, but rejects NaN and clips beyond a known duration',async()=>{
  const value=videoTimeline({operation:'edit',value:videoTimeline({operation:'new',width:16,height:16}),op:{kind:'import-media',media:{id:'video',name:'recording.webm',mime:'video/webm',kind:'video',duration:2,width:16,height:16},bytes:new Uint8Array([1])}});
  const placed=videoTimeline({operation:'edit',value,op:{kind:'place-media',mediaId:'video',clipId:'clip'}}),trimmed=videoTimeline({operation:'edit',value:placed,op:{kind:'trim',id:'clip',in:.5,out:1}});
  const cases=[...[Infinity,NaN,0,.5,.75,1].map(duration=>({duration,time:.5,revealed:duration,actual:undefined as number|undefined,reject:Number.isNaN(duration)||duration<=.5})),
    {duration:Infinity,time:0,revealed:.5,actual:.5,reject:true},
    {duration:Infinity,time:0,revealed:Infinity,actual:.499999,reject:true},
    {duration:Infinity,time:.5,revealed:Infinity,actual:1,reject:true},
    {duration:Infinity,time:0,revealed:NaN,actual:.5,reject:true}];
  for(const check of cases){const{duration}=check;
    class Decoder extends EventTarget{
      duration=duration;videoWidth=16;videoHeight=16;readyState=2;seeking=false;src='';time=0;
      get currentTime(){return this.time;}set currentTime(value:number){this.time=check.actual??value;this.duration=check.revealed;queueMicrotask(()=>this.dispatchEvent(new Event('seeked')));}
      load(){if(this.src)queueMicrotask(()=>this.dispatchEvent(new Event('loadeddata')));}pause(){}removeAttribute(){this.src='';}
    }
    const decoder=new Decoder(),canvas={width:16,height:16,getContext:()=>ctx},ctx={canvas,fillStyle:'',fillRect(){},drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(16*16*4)})};
    const document={createElement:(tag:string)=>tag==='video'?decoder:canvas}as unknown as Document;
    const result=videoSource({document,value:trimmed,time:check.time,source:{workspace:'video',documentId:'video',identity:'r1',epoch:1,viewRevision:'end'},label:'End',isCurrent:()=>true});
    if(check.reject)await assert.rejects(result,{name:'BridgeFrameReadbackError'});
    else{const frame=await result;assert.equal(decoder.currentTime,Math.min(.999999,duration-.000001));assert.equal(frame.frame.timelineSeconds,.5);}
  }
});
