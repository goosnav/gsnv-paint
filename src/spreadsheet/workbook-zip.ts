/**
 * PURPOSE    Provide bounded XLSX ZIP transport.
 * KIND       SHELL
 * CONTRACT   IN: ZIP bytes or entries. OUT: owned entries or ZIP bytes. RAISES: readable ZIP errors for malformed/unsupported data or size limits.
 * GUARANTEES Checks paths, lengths, CRC, duplicates and expanded limits; streaming decompression cannot exceed declared bounds.
 * TUNING     20MiB encoded;64MiB expanded;4096 entries.
 * DECISIONS  D1: Use native DecompressionStream and pinned SheetJS CFB instead of implementing a compression codec. Alternative: whole-buffer unchecked decompression. Revisit if: another compression method becomes necessary.
 * LIMITS     Stored/deflate only; no ZIP64, encryption, traversal or external access.
 * TESTBENCH  src/spreadsheet/workbook-files.test.ts -- node --import tsx --test src/spreadsheet/workbook-files.test.ts
 */
import {CFB} from 'xlsx';
const MAX_INPUT=20*1024*1024,MAX_OUTPUT=64*1024*1024;
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes:Uint8Array){let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]!^(value>>>8);return(value^0xffffffff)>>>0;}
function fail(message:string):never{throw new Error(`XLSX ZIP: ${message}`);}
export async function openWorkbookZip(bytes:Uint8Array):Promise<Map<string,Uint8Array>>{
 if(bytes.length>MAX_INPUT)fail('file exceeds 20 MiB.');if(bytes.length<22)fail('invalid ZIP file.');
 const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(data.getUint32(i,true)===0x06054b50&&i+22+data.getUint16(i+20,true)===bytes.length){end=i;break;}
 if(end<0)fail('missing end record.');const count=data.getUint16(end+10,true),length=data.getUint32(end+12,true),start=data.getUint32(end+16,true);
 if(data.getUint16(end+4,true)||data.getUint16(end+6,true)||count!==data.getUint16(end+8,true)||count>4096||start+length!==end)fail('unsupported ZIP layout.');
 const entries:{name:string;offset:number;compressed:number;size:number;crc:number;method:number;flags:number}[]=[],names=new Set<string>();let at=start,total=0;
 for(let i=0;i<count;i++){
  if(at+46>end||data.getUint32(at,true)!==0x02014b50)fail('invalid directory.');
  const flags=data.getUint16(at+8,true),method=data.getUint16(at+10,true),compressed=data.getUint32(at+20,true),size=data.getUint32(at+24,true),n=data.getUint16(at+28,true),extra=data.getUint16(at+30,true),comment=data.getUint16(at+32,true),offset=data.getUint32(at+42,true);
  if(flags&1||![0,8].includes(method)||at+46+n+extra+comment>end||compressed===0xffffffff||size===0xffffffff||offset===0xffffffff)fail('encrypted, ZIP64 or unsupported entry.');
  let name='';try{name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(at+46,at+46+n));}catch{fail('entry names must be UTF-8.');}
  if(!name||name.startsWith('/')||name.includes('\\')||name.includes('\0')||name.split('/').some(x=>x==='..'||x==='.')||names.has(name.toLowerCase()))fail('unsafe or duplicate entry name.');names.add(name.toLowerCase());
  total+=size;if(total>MAX_OUTPUT||size>MAX_OUTPUT)fail('expanded workbook exceeds 64 MiB.');
  entries.push({name,offset,compressed,size,crc:data.getUint32(at+16,true),method,flags});at+=46+n+extra+comment;
 }
 if(at!==end)fail('inconsistent directory length.');
 const result=new Map<string,Uint8Array>();let previousEnd=0;
 for(const entry of entries.sort((a,b)=>a.offset-b.offset)){
  const {offset,compressed,size,method,flags,name}=entry;
  if(offset<previousEnd||offset+30>start||data.getUint32(offset,true)!==0x04034b50||data.getUint16(offset+8,true)!==method||data.getUint16(offset+6,true)!==flags)fail('invalid local entry.');
  const n=data.getUint16(offset+26,true),extra=data.getUint16(offset+28,true),begin=offset+30+n+extra;
  if(begin+compressed>start||new TextDecoder().decode(bytes.subarray(offset+30,offset+30+n))!==name)fail('invalid local entry length/name.');
  if(!(flags&8)&&(data.getUint32(offset+22,true)!==size||data.getUint32(offset+18,true)!==compressed))fail('inconsistent entry size.');previousEnd=begin+compressed;
  let content:Uint8Array;
  if(method===0){if(compressed!==size)fail('stored length mismatch.');content=bytes.slice(begin,begin+size);}
  else{
   if(typeof DecompressionStream==='undefined')fail('this browser cannot decompress XLSX files. Use CSV or a current Chromium browser.');
   const stream=new Blob([bytes.slice(begin,begin+compressed)]).stream().pipeThrough(new DecompressionStream('deflate-raw')),reader=stream.getReader();
   content=new Uint8Array(size);let written=0;
   try{for(;;){const item=await reader.read();if(item.done)break;if(written+item.value.length>size){await reader.cancel();fail('expanded entry exceeds declared size.');}content.set(item.value,written);written+=item.value.length;}}finally{reader.releaseLock();}
   if(written!==size)fail('expanded entry length mismatch.');
  }
  if(crc(content)!==entry.crc)fail('entry checksum mismatch.');if(!name.endsWith('/'))result.set(name,content);
 }
 return result;
}
export function writeWorkbookZip(entries:ReadonlyMap<string,Uint8Array>):Uint8Array{
 let total=0;for(const bytes of entries.values()){total+=bytes.byteLength;if(total>MAX_OUTPUT)fail('expanded workbook exceeds 64 MiB.');}if(entries.size>4096)fail('too many entries.');
 const zip=CFB.utils.cfb_new();for(const[name,bytes]of entries)CFB.utils.cfb_add(zip,name,bytes);
 const bytes=new Uint8Array(CFB.write(zip,{type:'array',fileType:'zip',compression:true}));if(bytes.byteLength>MAX_INPUT)fail('export exceeds 20 MiB.');return bytes;
}
