import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPlaneFrame } from './default-plane-frame.ts';
test('C70 default bases map asymmetric points with right-handed unit frames', () => {
  const expected = { XY: [[1,0,0],[0,1,0],[0,0,1],[2,3,5]], XZ: [[1,0,0],[0,0,1],[0,-1,0],[2,-5,3]], YZ: [[0,1,0],[0,0,1],[1,0,0],[5,2,3]] };
  for (const plane of ['XY','XZ','YZ'] as const) {
    const { frame, localToWorld:m } = defaultPlaneFrame(plane), [x,y,n,p] = expected[plane];
    assert.deepEqual(frame,{origin:[0,0,0],x,y,normal:n});
    assert.deepEqual([0,1,2].map(i=>m[i]!*2+m[4+i]!*3+m[8+i]!*5+m[12+i]!),p);
    const cross=[frame.x[1]*frame.y[2]-frame.x[2]*frame.y[1],frame.x[2]*frame.y[0]-frame.x[0]*frame.y[2],frame.x[0]*frame.y[1]-frame.x[1]*frame.y[0]];
    assert.deepEqual(cross.map(v=>v||0),frame.normal);
    assert.deepEqual([frame.x,frame.y,frame.normal].map(v=>v.reduce((s,n,i)=>s+n*p![i]!,0)),[2,3,5]);
    assert.deepEqual([m[3],m[7],m[11],m[15]],[0,0,0,1]);
  }
});
test('C70 rejects unsupported values and owns each returned array', () => {
  for(const plane of [null,undefined,'xy','ZX',{},0])assert.throws(()=>defaultPlaneFrame(plane as 'XY'),{name:'DefaultPlaneError'});
  const a=defaultPlaneFrame('XZ');a.frame.x[0]=7;a.localToWorld[0]=8;
  assert.equal(defaultPlaneFrame('XZ').frame.x[0],1);assert.equal(defaultPlaneFrame('XZ').localToWorld[0],1);
});
