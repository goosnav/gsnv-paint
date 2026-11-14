/**
 * PURPOSE    Preserve the supported OOXML cell style subset.
 * KIND       SHELL
 * CONTRACT   IN: bounded ZIP entries and detached XML parser; optional Workbook. OUT: style map/warnings or mutated output-only entries. RAISES: readable malformed XML/relationship errors.
 * GUARANTEES Rejects entities; never inserts workbook XML into live DOM; unsupported styles return warnings.
 * TUNING     E01 cell bounds and E03 expanded-size bounds.
 * DECISIONS  D1: SheetJS CE writes numeric formats; explicit OOXML mapping preserves the visual styles this app supports. Alternative: silently dropping unsupported vendor styles. Revisit if: additional cell styles become part of the contract.
 * LIMITS     No borders, theme/indexed colors, underline or strikethrough; default theme text maps to default app text.
 * TESTBENCH  src/spreadsheet/workbook-files.test.ts -- node --import tsx --test src/spreadsheet/workbook-files.test.ts
 */
import type {Workbook} from './workbook-document.ts';
type Format=NonNullable<Workbook['sheets'][number]['cells'][string]['format']>;
type Parse=(text:string)=>Document;
const namespace='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const decoder=new TextDecoder('utf-8',{fatal:true}),encoder=new TextEncoder();
function xml(entries:ReadonlyMap<string,Uint8Array>,path:string,parse:Parse):Document{
 const bytes=entries.get(path);if(!bytes)throw new Error(`XLSX is missing ${path}.`);const source=decoder.decode(bytes);
 if(/<!DOCTYPE|<!ENTITY/i.test(source))throw new Error('XLSX XML entities are unsupported.');const doc=parse(source);
 if(doc.getElementsByTagNameNS('*','parsererror').length)throw new Error(`Invalid XLSX XML in ${path}.`);return doc;
}
const children=(root:Document|Element,tag:string)=>Array.from(root.getElementsByTagNameNS('*',tag));
const first=(root:Document|Element,tag:string)=>children(root,tag)[0];
function paths(entries:ReadonlyMap<string,Uint8Array>,parse:Parse):{name:string;path:string}[]{
 const workbook=xml(entries,'xl/workbook.xml',parse),rels=xml(entries,'xl/_rels/workbook.xml.rels',parse);
 return children(workbook,'sheet').map(sheet=>{
  const id=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');const rel=children(rels,'Relationship').find(x=>x.getAttribute('Id')===id);
  if(!rel||rel.getAttribute('TargetMode')==='External')throw new Error('External/missing worksheets are unsupported.');
  const target=rel.getAttribute('Target')??'',parts=(target.startsWith('/')?target.slice(1):`xl/${target}`).split('/'),normal:string[]=[];
  for(const part of parts){if(part==='..'){if(!normal.length)throw new Error('Invalid worksheet path.');normal.pop();}else if(part&&part!=='.')normal.push(part);}
  return{name:sheet.getAttribute('name')??'',path:normal.join('/')};
 });
}
function hex(element:Element|undefined):string|undefined{const rgb=element?.getAttribute('rgb');return rgb&&/^(?:[\da-f]{2})?[\da-f]{6}$/i.test(rgb)?`#${rgb.slice(-6).toLowerCase()}`:undefined;}
function enabled(element:Element|undefined){return !!element&&!['0','false'].includes(element.getAttribute('val')??'1');}
export const xlsxStyles={
 read(entries:ReadonlyMap<string,Uint8Array>,parse:Parse):{styles:Map<string,Record<string,Format>>;warnings:string[]}{
  const styles=new Map<string,Record<string,Format>>(),warnings=new Set<string>();if(!entries.has('xl/styles.xml'))return{styles,warnings:[]};
  const doc=xml(entries,'xl/styles.xml',parse),fonts=Array.from(first(doc,'fonts')?.children??[]),fills=Array.from(first(doc,'fills')?.children??[]),xfs=Array.from(first(doc,'cellXfs')?.children??[]);
  const formats=xfs.map(xf=>{
   const font=fonts[Number(xf.getAttribute('fontId')??0)],fill=fills[Number(xf.getAttribute('fillId')??0)],align=first(xf,'alignment')?.getAttribute('horizontal'),pattern=fill&&first(fill,'patternFill');
   const out:Record<string,unknown>={};if(font){if(enabled(first(font,'b')))out.bold=true;if(enabled(first(font,'i')))out.italic=true;const node=first(font,'color'),color=hex(node);if(color)out.color=color;else if(node&&(node.hasAttribute('indexed')||node.hasAttribute('theme')&&node.getAttribute('theme')!=='1'))warnings.add('Theme/indexed font colors are not supported.');if(first(font,'u')||first(font,'strike'))warnings.add('Underline/strikethrough cell styles are not supported.');}
   if(pattern?.getAttribute('patternType')==='solid'){const color=hex(first(pattern,'fgColor'));if(color)out.fill=color;else warnings.add('Theme/indexed cell fills are not supported.');}
   if(align&&['left','center','right'].includes(align))out.align=align;else if(align)warnings.add('Some cell alignments are not supported.');
   if(Number(xf.getAttribute('borderId')??0)>0)warnings.add('Cell borders are not supported.');return out as Format;
  });
  for(const item of paths(entries,parse)){const sheet=xml(entries,item.path,parse),cells:Record<string,Format>={};for(const cell of children(sheet,'c')){const format=formats[Number(cell.getAttribute('s')??0)];if(format&&Object.keys(format).length)cells[cell.getAttribute('r')??'']=format;}styles.set(item.name,cells);}
  return{styles,warnings:[...warnings]};
 },
 write(entries:Map<string,Uint8Array>,book:Workbook,parse:Parse):void{
  const doc=xml(entries,'xl/styles.xml',parse),fonts=first(doc,'fonts')!,fills=first(doc,'fills')!,xfs=first(doc,'cellXfs')!;
  const element=(tag:string,attrs:Record<string,string>={})=>{const node=doc.createElementNS(namespace,tag);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,v);return node;};
  const cache=new Map<string,number>();
  for(const [index,item]of paths(entries,parse).entries()){
   const sheet=xml(entries,item.path,parse),model=book.sheets[index]!;
   for(const cell of children(sheet,'c')){
    const format=model.cells[cell.getAttribute('r')??'']?.format;if(!format)continue;const old=cell.getAttribute('s')??'0',key=JSON.stringify([old,format]);let id=cache.get(key);
    if(id===undefined){
     const xf=(xfs.children[Number(old)]??xfs.children[0])!.cloneNode(true) as Element;
     if(format.bold||format.italic||format.color){const font=element('font');font.append(element('sz',{val:'11'}),element('name',{val:'Calibri'}));if(format.bold)font.append(element('b'));if(format.italic)font.append(element('i'));if(format.color)font.append(element('color',{rgb:`FF${format.color.slice(1).toUpperCase()}`}));xf.setAttribute('fontId',String(fonts.children.length));xf.setAttribute('applyFont','1');fonts.append(font);}
     if(format.fill){const fill=element('fill'),pattern=element('patternFill',{patternType:'solid'});pattern.append(element('fgColor',{rgb:`FF${format.fill.slice(1).toUpperCase()}`}),element('bgColor',{indexed:'64'}));fill.append(pattern);xf.setAttribute('fillId',String(fills.children.length));xf.setAttribute('applyFill','1');fills.append(fill);}
     if(format.align){first(xf,'alignment')?.remove();xf.append(element('alignment',{horizontal:format.align}));xf.setAttribute('applyAlignment','1');}
     id=xfs.children.length;xfs.append(xf);cache.set(key,id);
    }cell.setAttribute('s',String(id));
   }entries.set(item.path,encoder.encode(sheet.documentElement.outerHTML));
  }
  for(const node of[fonts,fills,xfs])node.setAttribute('count',String(node.children.length));entries.set('xl/styles.xml',encoder.encode(doc.documentElement.outerHTML));
 }
};
