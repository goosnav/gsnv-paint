import {JSDOM}from'jsdom';import{cadProperties}from'./cad-properties.ts';import{editableCADContent}from'./editable-cad-content.ts';
const dom=new JSDOM('<main></main>'),root=dom.window.document.querySelector('main')!;
cadProperties({root,onEdit:console.log}).update({content:editableCADContent({operation:'new'}),selected:[],state:'idle',message:'Ready to sketch.',result:null});console.log(root.textContent);
