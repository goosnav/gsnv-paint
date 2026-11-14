import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeContainer } from '../shared/native-container.ts';
import { videoTimeline, duration, type VideoContent, type VideoOp } from './video-timeline.ts';
const edit=(value:VideoContent,op:VideoOp)=>videoTimeline({operation:'edit',value,op});
function fixture(){
  let value=edit(videoTimeline({operation:'new',width:160,height:120}),{kind:'import-media',media:{id:'source',name:'local.webm',mime:'video/webm',kind:'video',duration:2,width:128,height:96},bytes:new Uint8Array([7,8,9])});
  value=edit(value,{kind:'place-media',mediaId:'source',clipId:'clip'});
  return edit(value,{kind:'title',title:{id:'title',text:'Text',start:0,duration:1,size:32,color:'#ffffff',position:'middle',background:false}});
}
function encoded(){return structuredClone(videoTimeline({operation:'encode',value:fixture()}));}
const malformed:readonly [string,(input:ReturnType<typeof encoded>)=>void][]=[
  ['duplicate media IDs',x=>x.content.media.push({...x.content.media[0]!,name:'Other'})],
  ['duplicate clip IDs',x=>x.content.clips.push({...x.content.clips[0]!})],
  ['duplicate title IDs',x=>x.content.titles.push({...x.content.titles[0]!})],
  ['duplicate asset IDs',x=>x.assets.push({...x.assets[0]!,bytes:new Uint8Array([3])})],
  ['missing assets',x=>x.assets.splice(0)],
  ['unreferenced assets',x=>x.assets.push({id:'unreferenced',mime:'video/webm',bytes:new Uint8Array([1])})],
  ['empty media ID',x=>x.content.media[0]!.id=''],
  ['missing media ID',x=>Reflect.deleteProperty(x.content.media[0]!,'id')],
  ['missing clip ID',x=>Reflect.deleteProperty(x.content.clips[0]!,'id')],
  ['empty clip ID',x=>x.content.clips[0]!.id=''],
  ['missing title ID',x=>Reflect.deleteProperty(x.content.titles[0]!,'id')],
  ['empty title ID',x=>x.content.titles[0]!.id=''],
  ['missing asset ID',x=>Reflect.deleteProperty(x.assets[0]!,'id')],
  ['numeric media ID',x=>Reflect.set(x.content.media[0]!,'id',1)],
  ['numeric clip ID',x=>Reflect.set(x.content.clips[0]!,'id',1)],
  ['numeric title ID',x=>Reflect.set(x.content.titles[0]!,'id',1)],
  ['null media',x=>Reflect.set(x.content.media,0,null)],
  ['null clip',x=>Reflect.set(x.content.clips,0,null)],
  ['null title',x=>Reflect.set(x.content.titles,0,null)],
  ['null asset',x=>Reflect.set(x.assets,0,null)],
  ['empty asset bytes',x=>x.assets[0]!.bytes=new Uint8Array()],
  ['non-byte asset payload',x=>Reflect.set(x.assets[0]!,'bytes',[7,8,9])],
  ['unknown clip media reference',x=>x.content.clips[0]!.mediaId='missing'],
  ['null clip media reference',x=>Reflect.set(x.content.clips[0]!,'mediaId',null)],
  ['zero media width',x=>x.content.media[0]!.width=0],
  ['negative media height',x=>x.content.media[0]!.height=-1],
  ['fractional media width',x=>x.content.media[0]!.width=1.5],
];
for(const[name,mutate]of malformed)test(`V-TIMELINE native rejects ${name} without changing input`,()=>{
  const input=encoded();mutate(input);const before=structuredClone(input);
  assert.throws(()=>videoTimeline({operation:'decode',content:input.content,assets:input.assets}),{name:'VideoContentError'});
  assert.deepEqual(input,before);
});
test('V-TIMELINE native rejects malformed collections and retains valid independent IDs and unplaced bytes',()=>{
  const input=encoded();for(const content of [null,{}, {...input.content,media:null},{...input.content,clips:{}},{...input.content,titles:'bad'}])assert.throws(()=>videoTimeline({operation:'decode',content,assets:input.assets}),{name:'VideoContentError'});
  input.content.clips[0]!.id='source';input.content.titles[0]!.id='source';
  const value=videoTimeline({operation:'decode',content:input.content,assets:input.assets});assert.deepEqual([...value.bytes.get('source')!],[7,8,9]);
  const withoutClip=edit(value,{kind:'delete',id:'source'}),removed=edit(withoutClip,{kind:'remove-media',mediaId:'source'}),out=videoTimeline({operation:'encode',value:removed});
  assert.equal(removed.bytes.size,0);assert.equal(out.assets.length,0);assert.equal(withoutClip.bytes.size,1);
  const parts=nativeContainer({op:'encode',package:{project:{format:'gsnv-video',version:1,id:'video',title:'Removed',content:out.content},assets:out.assets}}).parts;
  const pkg=nativeContainer({op:'decode',parts});assert.deepEqual(videoTimeline({operation:'decode',content:pkg.project.content,assets:pkg.assets}),removed);
});
test('V-TIMELINE edits cannot create empty or non-string native identities',()=>{
  for(const id of ['',1,null]){
    const value=fixture(),before=structuredClone(value);
    assert.throws(()=>edit(value,{kind:'split',time:.5,newId:id as string}),{name:'VideoEditError'});
    assert.throws(()=>edit(value,{kind:'place-media',mediaId:'source',clipId:id as string}),{name:'VideoEditError'});
    assert.throws(()=>edit(value,{kind:'import-media',media:{...value.media[0]!,id:id as string},bytes:new Uint8Array([1])}),{name:'VideoEditError'});
    assert.deepEqual(value,before);
  }
});
test('V-TIMELINE End samples the final half-open trim without changing offset, fade, interior times or source',()=>{
  for(const [inside,out]of [[0,.5],[.5,1]] as const){
    const value=edit(fixture(),{kind:'trim',id:'clip',in:inside,out}),before=structuredClone(value),total=duration(value);
    const end=videoTimeline({operation:'locate',value,time:total})!;assert.equal(end.clip.id,'clip');assert.equal(end.offset,.5);assert.equal(end.fade,1);assert.equal(end.source,out-1e-6);assert.ok(end.source>=inside&&end.source<out);
    const near=videoTimeline({operation:'locate',value,time:total-1e-7})!;assert.equal(near.source,inside+(total-1e-7));assert.equal(near.offset,total-1e-7);
    for(const time of [-1,NaN,Infinity,total+1e-7])assert.equal(videoTimeline({operation:'locate',value,time}),null);
    const faded=edit(value,{kind:'clip',id:'clip',fadeOut:.2}),fadeEnd=videoTimeline({operation:'locate',value:faded,time:total})!;assert.equal(fadeEnd.fade,0);assert.equal(fadeEnd.offset,total);assert.equal(fadeEnd.source,out-1e-6);
    const split=edit(value,{kind:'split',time:.25,newId:'second'});assert.deepEqual(split.clips.map(c=>[c.in,c.out]),[[inside,inside+.25],[inside+.25,out]]);assert.throws(()=>edit(value,{kind:'split',time:total,newId:'bad'}),{name:'VideoEditError'});
    assert.deepEqual(value,before);
  }
});
test('V-TIMELINE adjacent boundaries choose the next clip while the final boundary stays inside its source',()=>{
  let value=edit(fixture(),{kind:'trim',id:'clip',in:0,out:.5});value=edit(value,{kind:'place-media',mediaId:'source',clipId:'second'});value=edit(value,{kind:'trim',id:'second',in:.5,out:1});
  const boundary=videoTimeline({operation:'locate',value,time:.5})!;assert.deepEqual([boundary.clip.id,boundary.offset,boundary.source],['second',0,.5]);
  const end=videoTimeline({operation:'locate',value,time:1})!;assert.deepEqual([end.clip.id,end.offset,end.source],['second',.5,.999999]);
});
test('V-TIMELINE End enlarges the sample margin only when one microsecond is not representable',()=>{
  const out=2**40,inside=out-1,value=fixture();
  const large={...value,media:value.media.map(m=>({...m,duration:out})),clips:value.clips.map(c=>({...c,in:inside,out}))};
  const end=videoTimeline({operation:'locate',value:large,time:1})!;assert.equal(end.source,out-2**-13);assert.equal(end.offset,1);assert.equal(end.fade,1);
});
