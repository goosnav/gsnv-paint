import{checkRecipeBudget}from'./image-recipe-budget.ts';import{imageContent}from'./image-content.ts';
checkRecipeBudget(imageContent({operation:'new',width:32,height:32,fill:[255,255,255,255]}),{format:'gsnv-actions',version:1,name:'Small',assets:[],output:'png',steps:[]});console.log('Small recipe fits the decoded-layer budget.');
