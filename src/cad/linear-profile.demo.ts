import { linearProfile } from './linear-profile.ts';
console.log(linearProfile({entities:[{id:'a',kind:'segment',a:[0,0],b:[10,0],construction:false},{id:'b',kind:'segment',a:[10,0],b:[0,10],construction:false},{id:'c',kind:'segment',a:[0,10],b:[0,0],construction:false}],tolerance:1e-7}));
