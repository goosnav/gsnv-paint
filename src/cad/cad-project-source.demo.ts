import { cadProjectSource } from './cad-project-source.ts';
const source=cadProjectSource({operation:'import',name:'example.step',bytes:new TextEncoder().encode('ISO-10303-21;'),units:'mm',featureId:'import-1',assetId:'step-1'});
const native=cadProjectSource({operation:'encode',source});
console.log(JSON.stringify(native.content,null,2));
console.log('Embedded original bytes:',native.assets[0]!.bytes.length,'(geometry validation occurs separately in the worker)');
