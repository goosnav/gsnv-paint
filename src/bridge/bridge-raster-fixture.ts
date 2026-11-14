// Isolated real-browser raster test entry; never imported by the application.
import * as THREE from 'three';
import { captureCADViewport, type CadCapturePort } from '../cad/cad-viewport-capture.ts';
import { encodePng } from './png-encode.ts';
import { videoSource } from './video-source-adapter.ts';
import { videoTimeline } from '../video/video-timeline.ts';
import frameURL from './fixtures/frame-colors.webm?url';
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true }); renderer.setSize(320,240); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#dfe6ef');
const camera = new THREE.OrthographicCamera(-2,2,1.5,-1.5,.1,100); camera.position.set(0,0,5); camera.lookAt(0,0,0); camera.updateMatrixWorld();
const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,-1,1,0],3));
scene.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x4080c0 })));
const second = new THREE.Mesh(new THREE.PlaneGeometry(.5,.5), new THREE.MeshBasicMaterial({ color: 0x10c040 })); second.position.set(1.1,.9,0); scene.add(second);
renderer.render(scene,camera);
const stamp = { documentIdentity: 'r1', viewRevision: 'v1' }, viewport: CadCapturePort = { read: () => ({ ...stamp, renderer, scene, camera, overlays: [], width: 320, height: 240 }), isCurrent: expected => expected.documentIdentity === stamp.documentIdentity && expected.viewRevision === stamp.viewRevision };
const read = () => { const bytes = new Uint8Array(320*240*4), gl = renderer.getContext(); gl.readPixels(0,0,320,240,gl.RGBA,gl.UNSIGNED_BYTE,bytes); return bytes; };
const fixture = {
  async trimmedVideo(){
    const bytes=new Uint8Array(await(await fetch(frameURL)).arrayBuffer()),frames=[];
    let value=videoTimeline({operation:'edit',value:videoTimeline({operation:'new',width:160,height:120}),op:{kind:'import-media',media:{id:'colors',name:'colors.webm',mime:'video/webm',kind:'video',duration:2,width:128,height:96},bytes}});
    value=videoTimeline({operation:'edit',value,op:{kind:'place-media',mediaId:'colors',clipId:'clip'}});
    const request={document,source:{workspace:'video' as const,documentId:'video',identity:'r1',epoch:1,viewRevision:'end'},label:'End',isCurrent:()=>true};
    for(const[inside,out]of [[0,.5],[.5,1]]){const trimmed=videoTimeline({operation:'edit',value,op:{kind:'trim',id:'clip',in:inside!,out:out!}}),time=out!-inside!,frame=await videoSource({...request,value:trimmed,time});frames.push({sample:videoTimeline({operation:'locate',value:trimmed,time})!.source,timelineSeconds:frame.route==='video-frame-to-image'?frame.frame.timelineSeconds:-1,rgba:[...frame.pixels.rgba.subarray(0,4)]});}
    let beyond='';try{const trimmed=videoTimeline({operation:'edit',value,op:{kind:'trim',id:'clip',in:1.5,out:2}});await videoSource({...request,value:trimmed,time:.5});beyond='unexpected success';}catch(error){beyond=(error as Error).name;}
    return{frames,beyond};
  },
  async video() {
    const bytes = new Uint8Array(await (await fetch(frameURL)).arrayBuffer());
    const create=URL.createObjectURL,revoke=URL.revokeObjectURL,made:string[]=[],released:string[]=[];URL.createObjectURL=function(blob){const url=create.call(URL,blob);made.push(url);return url;};URL.revokeObjectURL=function(url){released.push(url);revoke.call(URL,url);};
    try {
    let value = videoTimeline({ operation: 'edit', value: videoTimeline({ operation: 'new' }), op: { kind: 'add-media', media: { id: 'colors', name: 'colors.webm', mime: 'video/webm', kind: 'video', duration: 1.5, width: 128, height: 96 }, bytes, clipId: 'clip' } });
    value = videoTimeline({ operation: 'edit', value, op: { kind: 'size', width: 160, height: 120 } });
    value = videoTimeline({ operation: 'edit', value, op: { kind: 'title', title: { id: 'title', text: 'TEST', start: 0, duration: 1.5, size: 150, color: '#ffffff', position: 'middle', background: false } } });
    const frames = [];
    for (const time of [.25,.75,1.25]) {
      const frame = await videoSource({ document, value, time, source: { workspace: 'video', documentId: 'video', identity: 'r1', epoch: 1, viewRevision: String(time) }, label: 'Frame', isCurrent: () => true });
      let whiteTitlePixels = 0; for (let i = 0; i < frame.pixels.rgba.length; i += 4) if (frame.pixels.rgba[i]! > 245 && frame.pixels.rgba[i+1]! > 245 && frame.pixels.rgba[i+2]! > 245) whiteTitlePixels++;
      frames.push({ size: [frame.pixels.width,frame.pixels.height], interior: [...frame.pixels.rgba.subarray(0,4)], whiteTitlePixels });
    }
    value = videoTimeline({ operation: 'edit', value, op: { kind: 'delete-title', id: 'title' } });
    value = videoTimeline({ operation: 'edit', value, op: { kind: 'size', width: 160, height: 160 } });
    value = videoTimeline({ operation: 'edit', value, op: { kind: 'clip', id: 'clip', fadeIn: .5 } });
    const request = { document, value, time: .25, source: { workspace: 'video' as const, documentId: 'video', identity: 'r1', epoch: 1, viewRevision: '.25' }, label: 'Frame', isCurrent: () => true };
    const faded = await videoSource(request), rgba = faded.pixels.rgba;
    let calls = 0, stale = '', cancelled = ''; try { await videoSource({ ...request, isCurrent: () => ++calls === 1 }); } catch (error) { stale = (error as Error).name; }
    const controller = new AbortController(), pending = videoSource({ ...request, signal: controller.signal }); controller.abort(); try { await pending; } catch (error) { cancelled = (error as Error).name; }
    let unreadable='';try{await videoSource({...request,value:{...value,bytes:new Map([['colors',new Uint8Array([1,2,3])]])}});}catch(error){unreadable=(error as Error).name;}
    return { frames, corner: [...rgba.subarray(0,4)], faded: [...rgba.subarray((30*160+10)*4,(30*160+10)*4+4)], stale, cancelled, unreadable, urlsReleased:made.length===7&&made.every(url=>released.includes(url)) };
    } finally { URL.createObjectURL=create;URL.revokeObjectURL=revoke; }
  },
  async lostContext(){renderer.forceContextLoss();await new Promise(resolve=>setTimeout(resolve,0));try{await captureCADViewport({viewport,width:320,height:240,expected:stamp});return 'unexpected success';}catch(error){return(error as Error).name;}},
  async cad() {
    const before = renderer.domElement.toDataURL(), background = scene.background, world = camera.matrixWorld.toArray();
    const capture = await captureCADViewport({ viewport, width: 320, height: 240, expected: stamp });
    const unchanged = before === renderer.domElement.toDataURL() && scene.background === background && JSON.stringify(camera.matrixWorld.toArray()) === JSON.stringify(world);
    let maxFringeError = 0, edges = 0;
    for (const shade of [0,255]) {
      scene.background = new THREE.Color().setRGB(shade/255,shade/255,shade/255,THREE.SRGBColorSpace); renderer.render(scene,camera); const reference = read();
      for (let y = 0; y < 240; y++) for (let x = 0; x < 320; x++) { const i = (y*320+x)*4, r = ((239-y)*320+x)*4, a = capture.rgba[i+3]!/255;
        if (!shade && a > 0 && a < 1) edges++;
        for (let c = 0; c < 3; c++) maxFringeError = Math.max(maxFringeError, Math.abs(Math.round(capture.rgba[i+c]!*a+shade*(1-a))-reference[r+c]!));
      }
    }
    scene.background = background; renderer.render(scene,camera);
    const pixel = (x: number,y: number) => [...capture.rgba.subarray((y*320+x)*4,(y*320+x)*4+4)];
    return { size: [capture.width,capture.height], corners: [[0,0],[319,0],[0,239],[319,239]].map(([x,y]) => pixel(x!,y!)[3]), blue: pixel(90,170), green: pixel(248,48), edges, maxFringeError, unchanged };
  },
  async png() { return [...await encodePng({ width: 6, height: 1, rgba: new Uint8ClampedArray([17,83,249,0,1,99,207,1,24,51,81,2,253,104,9,127,51,202,188,128,17,37,111,254]), colorSpace: 'srgb', alpha: 'straight' })]; },
};
declare global { interface Window { bridgeRaster: typeof fixture } }
window.bridgeRaster = fixture;
