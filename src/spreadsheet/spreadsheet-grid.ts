/**
 * PURPOSE    Translate virtual-grid interactions into editor intents.
 * KIND       SHELL
 * CONTRACT   IN: HTMLElement, intent callbacks and immutable workbook/selection updates. OUT: update/edit/flush/focus/dispose methods. RAISES: callback errors via onError.
 * GUARANTEES Only visible cells mount; source inputs flush synchronously; ordinary text editing remains native.
 * TUNING     E01 bounds; default96px columns/24px rows; only visible cells calculate for display.
 * DECISIONS  D1: Keep selection and scroll outside history; retain unchanged DOM to stabilize pointer/focus operations. Alternative: mounting every cell. Revisit if: tested accessibility or interaction needs require another grid strategy.
 * LIMITS     Single rectangular selection; no merged cells or touch-specific gestures.
 * TESTBENCH  src/spreadsheet/spreadsheet-grid.test.ts -- node --import tsx --test src/spreadsheet/spreadsheet-grid.test.ts
 */
import type {Workbook} from './workbook-document.ts';
import {sheetReferences} from './sheet-references.ts';
import {createSheetEvaluator,formatSheetValue} from './sheet-formulas.ts';
import {displaySheetCell} from './sheet-display.ts';
export type SheetSelection={r0:number;c0:number;r1:number;c1:number};
const address=(row:number,column:number)=>sheetReferences.write({row,column,absoluteRow:false,absoluteColumn:false});
export function spreadsheetGrid(ports:{root:HTMLElement;onSelect(range:SheetSelection):void;onEdit(address:string,input:string):void;onClipboard(event:ClipboardEvent):void;onError(error:unknown):void}){
 const doc=ports.root.ownerDocument,surface=doc.createElement('div'),space=doc.createElement('div'),cells=doc.createElement('div');surface.className='sheet-grid';surface.tabIndex=0;surface.setAttribute('role','grid');surface.setAttribute('aria-label','Workbook cells');space.className='sheet-grid-space';cells.className='sheet-grid-cells';space.append(cells);surface.append(space);ports.root.append(surface);
 let book:Workbook|undefined,sheet:Workbook['sheets'][number]|undefined,selection:SheetSelection={r0:0,c0:0,r1:0,c1:0},calc:ReturnType<typeof createSheetEvaluator>|undefined,x:number[]=[],y:number[]=[],visibleRows:number[]=[],editing:HTMLInputElement|null=null,editingAddress='',disposed=false,lastPaint='',revision=0;
 let anchor={row:0,column:0},end={row:0,column:0},drag:number|null=null,reportedBudget=false;
 const normalize=(a:typeof anchor,b:typeof anchor):SheetSelection=>({r0:Math.min(a.row,b.row),r1:Math.max(a.row,b.row),c0:Math.min(a.column,b.column),c1:Math.max(a.column,b.column)});
 function layout(){if(!sheet)return;x=[44];for(let c=0;c<sheet.columns;c++)x.push(x.at(-1)!+(sheet.columnWidths[c]??96));visibleRows=[];y=[26];
  for(let r=0;r<sheet.rows;r++){const f=sheet.filter;if(f&&r>f.range.r0&&r<=f.range.r1&&!formatSheetValue(calc!.cell(sheet.name,r,f.column)).toLowerCase().includes(f.query.toLowerCase())){if(calc!.budgetExceeded())break;continue;}visibleRows.push(r);y.push(y.at(-1)!+(sheet.rowHeights[r]??24));}
  if(calc!.budgetExceeded()){visibleRows=Array.from({length:sheet.rows},(_,r)=>r);y=[26];for(const r of visibleRows)y.push(y.at(-1)!+(sheet.rowHeights[r]??24));}
  space.style.width=`${x.at(-1)}px`;space.style.height=`${y.at(-1)}px`;surface.setAttribute('aria-rowcount',String(sheet.rows));surface.setAttribute('aria-colcount',String(sheet.columns));
 }
 function paint(){if(!sheet||disposed)return;const width=surface.clientWidth||840,height=surface.clientHeight||460,left=surface.scrollLeft,top=surface.scrollTop,stamp=`${revision}/${JSON.stringify(selection)}/${width}/${height}/${left}/${top}`;if(lastPaint===stamp)return;lastPaint=stamp;cells.replaceChildren();
  const node=(text:string,className:string,px:number,py:number,w:number,h:number)=>{const el=doc.createElement('div');el.className=className;el.textContent=text;el.style.cssText=`left:${px}px;top:${py}px;width:${w}px;height:${h}px`;cells.append(el);return el;};
  for(let c=0;c<sheet.columns;c++){if(x[c+1]!<left+44||x[c]!>left+width)continue;const header=node(address(0,c).replace('1',''),'sheet-column',x[c]!,top,x[c+1]!-x[c]!,26);header.dataset.column=String(c);
   for(let n=0;n<visibleRows.length;n++){if(y[n+1]!<top+26||y[n]!>top+height)continue;const r=visibleRows[n]!,key=address(r,c),cell=sheet.cells[key],value=calc!.cell(sheet.name,r,c),el=node(displaySheetCell(value,cell?.format),'sheet-cell',x[c]!,y[n]!,x[c+1]!-x[c]!,y[n+1]!-y[n]!);
    el.dataset.cell=key;el.dataset.row=String(r);el.dataset.column=String(c);el.setAttribute('role','gridcell');el.setAttribute('aria-rowindex',String(r+1));el.setAttribute('aria-colindex',String(c+1));el.setAttribute('aria-label',`${key}: ${el.textContent}`);el.title=cell?.input??'';
    if(r>=selection.r0&&r<=selection.r1&&c>=selection.c0&&c<=selection.c1){el.classList.add('selected');el.setAttribute('aria-selected','true');}if(r===selection.r0&&c===selection.c0)el.classList.add('active');if(typeof value==='object')el.classList.add('sheet-error');
    const format=cell?.format;if(format){el.style.fontWeight=format.bold?'bold':'';el.style.fontStyle=format.italic?'italic':'';el.style.color=format.color??'';el.style.backgroundColor=format.fill??'';}el.style.textAlign=format?.align??(typeof value==='number'?'right':'left');
   }
  }
  for(let n=0;n<visibleRows.length;n++){if(y[n+1]!<top+26||y[n]!>top+height)continue;const r=visibleRows[n]!,header=node(String(r+1),'sheet-row',left,y[n]!,44,y[n+1]!-y[n]!);header.dataset.row=String(r);}
  node('', 'sheet-corner',left,top,44,26);surface.setAttribute('aria-label',`Workbook cells, selected ${address(selection.r0,selection.c0)}:${address(selection.r1,selection.c1)}`);
  if(calc!.budgetExceeded()&&!reportedBudget){reportedBudget=true;ports.onError(new Error('Display calculation exceeded the work budget. Reduce large formula ranges. If a filter was active, all rows are shown.'));}
 }
 function finish(commit=true){if(!editing)return;const input=editing,value=input.value,key=editingAddress;editing=null;input.remove();if(commit&&value!==(sheet?.cells[key]?.input??''))try{ports.onEdit(key,value);}catch(error){ports.onError(error);}paint();}
 function reveal(row:number,column:number){const n=visibleRows.indexOf(row);if(n<0)return;const width=surface.clientWidth||840,height=surface.clientHeight||460;
  if(x[column]!<surface.scrollLeft+44)surface.scrollLeft=x[column]!-44;else if(x[column+1]!>surface.scrollLeft+width)surface.scrollLeft=x[column+1]!-width;
  if(y[n]!<surface.scrollTop+26)surface.scrollTop=y[n]!-26;else if(y[n+1]!>surface.scrollTop+height)surface.scrollTop=y[n+1]!-height;
 }
 function choose(row:number,column:number,extend=false){if(!sheet)return;finish();row=Math.max(0,Math.min(sheet.rows-1,row));column=Math.max(0,Math.min(sheet.columns-1,column));if(!extend)anchor={row,column};end={row,column};selection=normalize(anchor,end);reveal(row,column);ports.onSelect(selection);paint();}
 function edit(value?:string){if(!sheet)return;finish();const key=address(selection.r0,selection.c0),n=visibleRows.indexOf(selection.r0);if(n<0)return;const input=doc.createElement('input');input.setAttribute('aria-label','Cell input');input.className='sheet-cell-input';input.value=value??sheet.cells[key]?.input??'';input.style.cssText=`left:${x[selection.c0]}px;top:${y[n]}px;width:${Math.max(150,x[selection.c0+1]!-x[selection.c0]!)}px;height:${y[n+1]!-y[n]!}px`;space.append(input);editing=input;editingAddress=key;
  input.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish(false);surface.focus();}else if(event.key==='Enter'||event.key==='Tab'){event.preventDefault();event.stopPropagation();finish();choose(selection.r0+(event.key==='Enter'?(event.shiftKey?-1:1):0),selection.c0+(event.key==='Tab'?(event.shiftKey?-1:1):0));surface.focus();}});input.addEventListener('blur',()=>finish());input.focus();if(value===undefined)input.select();else input.setSelectionRange(value.length,value.length);
 }
 surface.addEventListener('keydown',event=>{
  if(event.target!==surface)return;if(event.ctrlKey||event.metaKey){if(['c','x','v'].includes(event.key.toLowerCase()))event.stopPropagation();return;}if(event.altKey)return;
  const directions:Record<string,[number,number]>={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0],Tab:[0,event.shiftKey?-1:1],Enter:[event.shiftKey?-1:1,0]};
  if(directions[event.key]){event.preventDefault();event.stopPropagation();const[dr,dc]=directions[event.key]!;choose((event.shiftKey?end.row:selection.r0)+dr,(event.shiftKey?end.column:selection.c0)+dc,event.shiftKey&&event.key!=='Tab'&&event.key!=='Enter');}
  else if(event.key==='F2'||event.key.length===1){event.preventDefault();event.stopPropagation();edit(event.key==='F2'?undefined:event.key);}
 });
 function point(event:PointerEvent){const rect=surface.getBoundingClientRect(),px=event.clientX-rect.left+surface.scrollLeft,py=event.clientY-rect.top+surface.scrollTop;const column=x.findIndex((v,i)=>i<x.length-1&&px>=v&&px<x[i+1]!),n=y.findIndex((v,i)=>i<y.length-1&&py>=v&&py<y[i+1]!);return column>=0&&n>=0?{row:visibleRows[n]!,column}:null;}
 surface.addEventListener('pointerdown',event=>{if(event.button!==0||event.target===editing)return;const target=(event.target as Element).closest<HTMLElement>('[data-cell]');if(!target)return;event.preventDefault();surface.focus();choose(Number(target.dataset.row),Number(target.dataset.column),event.shiftKey);drag=event.pointerId;surface.setPointerCapture?.(drag);});
 surface.addEventListener('pointermove',event=>{if(drag!==event.pointerId)return;const target=point(event);if(target&&(target.row!==end.row||target.column!==end.column))choose(target.row,target.column,true);});
 surface.addEventListener('pointerup',event=>{if(drag===event.pointerId){surface.releasePointerCapture?.(drag);drag=null;}});
 surface.addEventListener('pointercancel',()=>{drag=null;});surface.addEventListener('dblclick',event=>{if((event.target as Element).closest('[data-cell]'))edit();});
 for(const name of['copy','cut','paste'])surface.addEventListener(name,event=>{if(event.target===surface)ports.onClipboard(event as ClipboardEvent);});
 surface.addEventListener('scroll',paint);const observer=doc.defaultView?.ResizeObserver?new doc.defaultView.ResizeObserver(paint):undefined;observer?.observe(surface);
 return{update(value:Workbook,id:string,range:SheetSelection){if(editing&&book!==value)finish(false);const external=JSON.stringify(range)!==JSON.stringify(selection),changed=book!==value||sheet?.id!==id;book=value;sheet=book.sheets.find(s=>s.id===id);selection=range;if(changed){revision++;reportedBudget=false;calc=createSheetEvaluator({maxTotalSteps:2000000,sheets:book.sheets.map(s=>s.name),read:(name,r,c)=>book!.sheets.find(s=>s.name===name)?.cells[address(r,c)]?.input});layout();anchor={row:range.r0,column:range.c0};end={row:range.r1,column:range.c1};}if(external){anchor={row:range.r0,column:range.c0};end={row:range.r1,column:range.c1};reveal(range.r0,range.c0);}paint();},edit,flush:()=>finish(),focus:()=>surface.focus(),dispose(){disposed=true;finish(false);observer?.disconnect();ports.root.replaceChildren();}};
}
