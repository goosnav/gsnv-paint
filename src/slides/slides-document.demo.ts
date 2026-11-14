import { slidesDocument } from './slides-document.ts';
let deck=slidesDocument({operation:'new',slideId:'opening'});
deck=slidesDocument({operation:'edit',value:deck,action:{kind:'element-add',slide:'opening',id:'title',element:'text'}});
deck=slidesDocument({operation:'edit',value:deck,action:{kind:'element-update',slide:'opening',id:'title',changes:{text:'A local, editable presentation',x:80,y:120}}});
deck=slidesDocument({operation:'edit',value:deck,action:{kind:'slide-duplicate',id:'opening',duplicateId:'closing',elementIds:['closing-title']}});
console.log(JSON.stringify(slidesDocument({operation:'encode',value:deck}).content,null,2));
