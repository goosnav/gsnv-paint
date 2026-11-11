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
