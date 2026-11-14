import {test} from 'node:test';import assert from 'node:assert/strict';import{JSDOM}from'jsdom';
import{cadProperties}from'./cad-properties.ts';import{editableCADContent}from'./editable-cad-content.ts';import{editCADContent}from'./edit-cad-content.ts';
test('C58 feature errors and source dimensions are visible, safe and editable',()=>{
 const dom=new JSDOM('<div id="p"></div>'),root=dom.window.document.getElementById('p')!,edits:unknown[]=[];
 const panel=cadProperties({root,onEdit:e=>edits.push(e)}),content=editCADContent({content:editableCADContent({operation:'new'}),action:{kind:'rectangle',prefix:'r',width:'100',height:'60'}});
 content.graph.features[0].name='<script>bad</script>';
 panel.update({content,selected:['r-edge-0'],state:'error',message:'Sketch: conflicting horizontal and vertical constraints.',result:null});
 assert.match(root.textContent!,/conflicting/);assert.match(root.textContent!,/100/);assert.equal(root.querySelectorAll('script').length,0);
 root.querySelector<HTMLButtonElement>('[data-edit-id="r-width"]')!.click();assert.deepEqual(edits,[{command:'cad.dimension',id:'r-width'}]);
 root.querySelector<HTMLButtonElement>('[data-remove-constraint="r-axis-0"]')!.click();assert.deepEqual(edits.at(-1),{command:'cad.removeConstraint',id:'r-axis-0'});
 panel.dispose();assert.equal(root.childElementCount,0);
});
test('C58 invalid panel ports fail before binding handlers',()=>{
 assert.throws(()=>cadProperties({root:null as unknown as HTMLElement,onEdit(){}}),TypeError);
});
test('C58 selected document units display physical values without hiding editable source expressions',()=>{
 const dom=new JSDOM('<div id="p"></div>'),root=dom.window.document.getElementById('p')!;
 const panel=cadProperties({root,onEdit(){}});
 let content=editCADContent({content:editableCADContent({operation:'new'}),action:{kind:'rectangle',prefix:'r',width:'25.4',height:'2 * 25.4'}});
 content=editCADContent({content,action:{kind:'units',units:'inch'}});
 panel.update({content,selected:[],state:'ready',message:'Ready',result:null});
 assert.equal(root.querySelector('[data-edit-id="r-width"]')?.textContent,'Width: 1 in');
 assert.equal(root.querySelector('[data-edit-id="r-height"]')?.textContent,'Height: 2 in');
 assert.match(root.querySelector('[data-edit-id="r-height"]')?.getAttribute('title')??'',/2 \* 25.4/);
 panel.dispose();
});
test('C58 profile controls expose source editing and atomic group actions without free-member constraints',()=>{
 const dom=new JSDOM('<div id="p"></div>'),root=dom.window.document.getElementById('p')!,edits:unknown[]=[];
 const panel=cadProperties({root,onEdit:e=>edits.push(e)}),length=(source:string)=>({source,kind:'length' as const});
 const content=editCADContent({content:editableCADContent({operation:'new'}),action:{kind:'add-profile',profile:{id:'centered',kind:'center-rectangle',entityIds:['a','b','c','d'],center:[length('10'),length('20')],width:length('30'),height:length('8'),construction:false}}});
 panel.update({content,selected:['a','b','c','d'],state:'ready',message:'Ready',result:null});
 const edit=root.querySelector<HTMLButtonElement>('[data-profile-id="centered"]');assert.ok(edit);assert.match(edit.textContent!,/Centered rectangle/);edit.click();assert.deepEqual(edits.at(-1),{command:'cad.editProfile',id:'centered'});
 const buttons=[...root.querySelectorAll<HTMLButtonElement>('button')];
 for(const label of ['Horizontal','Vertical','Delete selected'])assert.equal(buttons.find(b=>b.textContent===label)!.disabled,true);
 buttons.find(b=>b.textContent==='Detach profile')!.click();assert.deepEqual(edits.at(-1),{command:'cad.detachProfile',id:'centered'});
 buttons.find(b=>b.textContent==='Make construction')!.click();assert.deepEqual(edits.at(-1),{command:'cad.profileConstruction',id:'centered'});
 buttons.find(b=>b.textContent==='Delete profile')!.click();assert.deepEqual(edits.at(-1),{command:'cad.removeProfile',id:'centered'});
 panel.dispose();
});
