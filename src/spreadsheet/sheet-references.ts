/**
 * PURPOSE    Translate source-preserving A1 references.
 * KIND       CORE
 * CONTRACT   IN: A1 source/reference or formula with a transform callback. OUT: reference or transformed source. RAISES: RangeError for invalid coordinates/API offsets.
 * GUARANTEES Preserves quoted strings, sheet names and absolute flags; translated invalid references become #REF!.
 * TUNING     Excel reference bounds:1048576 rows,16384 columns; E01 documents impose smaller storage bounds.
 * DECISIONS  D1: Source-aware translation keeps strings untouched and handles quoted sheet names. Alternative: regular expression replacement across whole formulas. Revisit if: structured references or new formula syntax become required.
 * LIMITS     Does not evaluate formulas or resolve named ranges.
 * TESTBENCH  src/spreadsheet/sheet-formulas.test.ts -- node --import tsx --test src/spreadsheet/sheet-formulas.test.ts
 */
export type CellReference = Readonly<{sheet?:string;row:number;column:number;absoluteRow:boolean;absoluteColumn:boolean}>;
const REFERENCE=/^(?:(?:'((?:[^']|'')+)'|([A-Za-z_][\w.]*))!)?(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/;
const PREFIX=/^(?:(?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?\$?[A-Za-z]{1,3}\$?\d+(?![\w.(])/;
function read(source:string):CellReference{
 const m=REFERENCE.exec(source);if(!m)throw new RangeError('Invalid cell reference.');
 let column=0;for(const c of m[4]!.toUpperCase())column=column*26+c.charCodeAt(0)-64;
 const row=Number(m[6])-1;if(row<0||row>=1048576||column<1||column>16384)throw new RangeError('Cell reference is outside the worksheet.');
 const sheet=m[1]?.replaceAll("''","'")??m[2];return{row,column:column-1,absoluteColumn:m[3]==='$',absoluteRow:m[5]==='$',...(sheet?{sheet}:{})};
}
function write(ref:CellReference):string{
 if(!Number.isInteger(ref.row)||!Number.isInteger(ref.column)||ref.row<0||ref.row>=1048576||ref.column<0||ref.column>=16384)throw new RangeError('Cell reference is outside the worksheet.');
 let n=ref.column+1,letters='';while(n){n--;letters=String.fromCharCode(65+n%26)+letters;n=Math.floor(n/26);}
 const sheet=ref.sheet===undefined?'':`${/^[A-Za-z_][\w.]*$/.test(ref.sheet)?ref.sheet:`'${ref.sheet.replaceAll("'","''")}'`}!`;
 return`${sheet}${ref.absoluteColumn?'$':''}${letters}${ref.absoluteRow?'$':''}${ref.row+1}`;
}
function shift(source:string,rows:number,columns:number):string{
 if(!Number.isSafeInteger(rows)||!Number.isSafeInteger(columns))throw new RangeError('Fill offsets must be integers.');
 return transform(source,(from,to)=>{const move=(ref:CellReference)=>write({...ref,row:ref.row+(ref.absoluteRow?0:rows),column:ref.column+(ref.absoluteColumn?0:columns)});return move(from)+(to?`:${move(to)}`:'');});
}
function transform(source:string,change:(from:CellReference,to?:CellReference)=>string):string{
 if(!source.startsWith('='))return source;
 let output='',i=0;while(i<source.length){
  if(source[i]==='"'){const start=i++;while(i<source.length){if(source[i++]==='"'){if(source[i]==='"'){i++;continue;}break;}}output+=source.slice(start,i);continue;}
  const match=(!i||!/[\w.]/.test(source[i-1]!))?PREFIX.exec(source.slice(i)):null;
  if(match){let end=i+match[0].length;const range=/^\s*:\s*/.exec(source.slice(end)),other=range?PREFIX.exec(source.slice(end+range[0].length)):null;
   try{output+=change(read(match[0]),other?read(other[0]):undefined);}catch(error){if(!(error instanceof RangeError))throw error;output+='#REF!';}
   if(other)end+=range![0].length+other[0].length;i=end;
  }
  else output+=source[i++];
 }return output;
}
export const sheetReferences=Object.freeze({read,write,shift,transform});
