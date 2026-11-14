/**
 * PURPOSE    Connect the Slides editor to the shared application host.
 * KIND       SHELL
 * CONTRACT   IN: shared FilePorts. OUT: WorkspaceAdapter for editable gsnv-slides projects.
 *            Pending inputs flush before shared save/undo; edits commit against the current identity.
 *            RAISES: malformed project errors during decode; operational errors remain visible.
 * GUARANTEES No remote resources or automatic execution; stale imports cannot overwrite later edits.
 * TUNING     Core owns document limits; local raster import is limited to 20 MiB.
 * DECISIONS  D1: Use shared host history/files instead of separate slide state storage. Alternative:
 *            workspace-local history would diverge from Save/Undo. Revisit if shared ports change.
 * LIMITS     Images decode through browser codecs; print/PDF handoff is controlled by the browser.
 * TESTBENCH  src/slides/slides-workspace.test.ts -- run with: node --import tsx --test src/slides/slides-workspace.test.ts
 */
import type { WorkspaceAdapter } from '../app/app-shell.ts';
import { fileAccess, type FilePorts } from '../shared/file-access.ts';
import { slidesDocument, type SlidesDocument, type SlidesAction } from './slides-document.ts';
import { slidesView } from './slides-view.ts';
import { slidesPlayback } from './slides-playback.ts';
type Snapshot = NonNullable<Parameters<ReturnType<WorkspaceAdapter['mount']>['render']>[0]>;
const base64=(bytes:Uint8Array)=>{let text='';for(let i=0;i<bytes.length;i+=0x8000)text+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(text);};
export function createSlidesWorkspace(files: FilePorts): WorkspaceAdapter {
  const id=()=>crypto.randomUUID();
  const blank=()=>({id:id(),title:'Untitled presentation',format:'gsnv-slides',version:1,value:slidesDocument({operation:'new',slideId:id()})});
  return {
    create:blank,
    decode(pkg){const p=pkg.project;if(p.format!=='gsnv-slides'||p.version!==1)throw new Error('This is not a supported gsnv-slides project.');return{id:p.id,title:p.title,format:p.format,version:p.version,value:slidesDocument({operation:'decode',content:p.content,assets:pkg.assets})};},
    encode(document){const encoded=slidesDocument({operation:'encode',value:document.value as SlidesDocument});return{project:{format:'gsnv-slides',version:1,id:document.id,title:document.title,content:encoded.content},assets:encoded.assets};},
    mount(host){
      const doc=host.root.ownerDocument,container=doc.createElement('div'),notice=doc.createElement('div'),editor=doc.createElement('div');container.className='slides-workspace';container.style.cssText='position:absolute;inset:0;display:grid;grid-template-rows:auto minmax(0,1fr)';editor.style.cssText='position:relative;grid-row:2;min-height:0';notice.hidden=true;notice.style.cssText='padding:7px 10px;background:#ffffe1;color:#820000;border-bottom:1px solid #888';container.append(notice,editor);host.root.append(container);
      let current:Snapshot|undefined,slideId:string|null=null,elementId:string|null=null,status='',disposed=false;
      const playback=slidesPlayback(container);
      const deck=()=>current?.value as SlidesDocument|undefined;
      const error=(cause:unknown)=>{if(disposed)return;status=cause instanceof Error?cause.message:String(cause);notice.textContent=status;notice.hidden=false;notice.setAttribute('role','alert');host.invalidate();};
      const clear=()=>{status='';notice.hidden=true;notice.textContent='';};
      const refresh=()=>view.update({deck:deck()??null,slideId,elementId});
      function apply(action:SlidesAction){
        if(!current)return;const value=slidesDocument({operation:'edit',value:deck()!,action});
        if(action.kind==='slide-add'){slideId=action.id;elementId=null;}else if(action.kind==='slide-duplicate'){slideId=action.duplicateId;elementId=null;}
        else if(action.kind==='element-add'){slideId=action.slide;elementId=action.id;}else if(action.kind==='element-remove')elementId=null;
        else if(action.kind==='slide-remove'){const at=deck()!.slides.findIndex(s=>s.id===action.id);slideId=value.slides[Math.min(at,value.slides.length-1)]!.id;elementId=null;}
        clear();if(JSON.stringify(value)===JSON.stringify(deck()))return;
        const label=action.kind==='element-update'?'Edit element':action.kind==='element-add'?`Insert ${action.element}`:action.kind.split('-').map((s,i)=>i?s:s[0]!.toUpperCase()+s.slice(1)).join(' ');
        host.commit({...current,value},label,current.identity);
      }
      async function picture(){
        if(!current||!slideId)return;const identity=current.identity,target=slideId;
        const opened=await fileAccess({op:'open',accept:{'image/png':['.png'],'image/jpeg':['.jpg','.jpeg'],'image/gif':['.gif'],'image/webp':['.webp']}},files);
        if(disposed||'cancelled'in opened)return;if(!opened.ok)throw new Error(opened.error.message);
        const length=opened.value.bytes.reduce((n,b)=>n+b.byteLength,0);if(length>20*1024*1024)throw new Error('Pictures must be smaller than 20 MiB.');
        const bytes=new Uint8Array(length);let offset=0;for(const part of opened.value.bytes){bytes.set(part,offset);offset+=part.length;}
        const extension=opened.value.name.split('.').at(-1)?.toLowerCase(),mime=extension==='jpg'||extension==='jpeg'?'image/jpeg':`image/${extension}`;
        if(!['image/png','image/jpeg','image/gif','image/webp'].includes(mime))throw new Error('Choose a PNG, JPEG, GIF or WebP picture.');
        const data=base64(bytes),image=doc.createElement('img');image.src=`data:${mime};base64,${data}`;
        try{await image.decode();if(!image.naturalWidth||!image.naturalHeight)throw new Error('Empty image');}catch{throw new Error(`Could not read “${opened.value.name}” as a picture. Choose a valid image.`);}
        if(disposed)return;if(current?.identity!==identity||slideId!==target)throw new Error('The presentation changed before the picture was ready. Insert it again.');
        apply({kind:'element-add',slide:target,id:id(),element:'image',image:{id:id(),mime,data,width:image.naturalWidth,height:image.naturalHeight}});
      }
      function command(command:string){
        try{
          view.flush();if(command==='slides.new'){void host.open(blank()).catch(error);return;}if(!current||!slideId)return;
          const value=deck()!,slide=value.slides.find(s=>s.id===slideId)!,index=value.slides.indexOf(slide),element=slide.elements.find(e=>e.id===elementId);
          if(command==='slides.add')apply({kind:'slide-add',id:id(),after:slideId});
          else if(command==='slides.duplicate')apply({kind:'slide-duplicate',id:slideId,duplicateId:id(),elementIds:slide.elements.map(()=>id())});
          else if(command==='slides.delete')apply({kind:'slide-remove',id:slideId});
          else if(command==='slides.up'||command==='slides.down')apply({kind:'slide-move',id:slideId,index:index+(command==='slides.up'?-1:1)});
          else if(['slides.text','slides.rectangle','slides.ellipse'].includes(command))apply({kind:'element-add',slide:slideId,id:id(),element:command.slice(7) as 'text'|'rectangle'|'ellipse'});
          else if(command==='slides.image')void picture().catch(error);
          else if((command==='slides.deleteElement'||command==='edit.delete')&&element)apply({kind:'element-remove',slide:slideId,id:element.id});
          else if((command==='slides.front'||command==='slides.back')&&element)apply({kind:'element-layer',slide:slideId,id:element.id,index:slide.elements.indexOf(element)+(command==='slides.front'?1:-1)});
          else if(command==='slides.present')playback.present(value,slideId);
          else if(command==='slides.pdf')void playback.print(value,current.title).catch(error);
          host.invalidate();
        }catch(cause){error(cause);}
      }
      const view=slidesView({root:editor,onAction:apply,onSelect(s,e){slideId=s;elementId=e;refresh();host.invalidate();},onCommand:command,onError:error});
      return {
        render(snapshot){const replaced=snapshot?.id!==current?.id;current=snapshot;if(replaced){slideId=null;elementId=null;clear();}const content=deck();if(!content?.slides.some(s=>s.id===slideId))slideId=content?.slides[0]?.id??null;if(!content?.slides.find(s=>s.id===slideId)?.elements.some(e=>e.id===elementId))elementId=null;refresh();},
        model(){const content=deck(),slide=content?.slides.find(s=>s.id===slideId),index=content?.slides.findIndex(s=>s.id===slideId)??-1,element=slide?.elements.findIndex(e=>e.id===elementId)??-1;
          const item=(command:string,label:string,enabled=!!content)=>({id:`slides.${command}`,label,shortcut:'',enabled});
          return{menus:[{id:'slides',label:'Slides',items:[item('add','New slide'),item('duplicate','Duplicate slide'),item('delete','Delete slide',(content?.slides.length??0)>1),item('up','Move slide up',index>0),item('down','Move slide down',!!content&&index<content.slides.length-1),item('present','Present'),item('pdf','Export PDF…')]},
            {id:'insert',label:'Insert',items:[item('text','Text box'),item('image','Picture…'),item('rectangle','Rectangle'),item('ellipse','Ellipse')]},
            {id:'arrange',label:'Arrange',items:[item('deleteElement','Delete element',element>=0),item('front','Bring forward',!!slide&&element>=0&&element<slide.elements.length-1),item('back','Send backward',element>0)]}],tools:[],panels:[]};},
        context:()=>({viewRole:'none',activeTool:'slides',status:status|| (deck()?`${deck()!.slides.length} slides · Select an element to edit it; drag to move, use the corner to resize.`:'Create or open a presentation.')}),
        command,gesture(){},flush:()=>view.flush(),dispose(){if(disposed)return;disposed=true;playback.dispose();view.dispose();host.root.replaceChildren();},
      };
    },
  };
}
