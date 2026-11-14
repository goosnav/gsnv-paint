import { createSlidesWorkspace } from './slides-workspace.ts';
const adapter=createSlidesWorkspace({document,URL,setTimeout}),root=document.getElementById('slides')!;
let current={...adapter.create!(),identity:'demo-0'},revision=0;
const editor=adapter.mount({root,commit(next,_label,base){if(base!==current.identity)return;current={...next,identity:`demo-${++revision}`};render();},dialog(){throw new Error('This demo uses inline properties.');},invalidate(){},async open(next){current={...next,identity:`demo-${++revision}`};render();return true;}});
function render(){editor.render(current,{zoom:1,pan:{x:0,y:0}});}render();
