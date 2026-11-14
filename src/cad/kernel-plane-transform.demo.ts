import { kernelFixture } from './kernel-test-fixture.ts';
import { buildLinearPrism } from './kernel-linear-prism.ts';
import { transformPartPlane } from './kernel-plane-transform.ts';
const f=await kernelFixture();
try{const token=transformPartPlane({session:f.session,token:buildLinearPrism({session:f.session,polygon:[[0,0],[20,0],[20,10],[0,10]],depth:6}),plane:'XZ'});console.log(f.measure(token));}finally{f.close();}
