import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSheetEvaluator } from './sheet-formulas.ts';
import { sheetReferences } from './sheet-references.ts';
import { parseFormula } from './sheet-parser.ts';

const make = (data: Record<string, Record<string,string>>) => createSheetEvaluator({ sheets: Object.keys(data), read: (sheet,row,column) => data[sheet]?.[sheetReferences.write({row,column,absoluteRow:false,absoluteColumn:false})] });
test('E02 arithmetic, strings, comparisons and lazy IF preserve typed values',()=>{
 const e=make({Sheet1:{}}), f=(source:string)=>e.formula(source,'Sheet1');
 for(const[source,want]of [['=2+3*4',14],['=(2+3)*4',20],['=2^3^2',512],['=10%',0.1],['="hello "&"world"','hello world'],['="a"="A"',true],['=2<>3',true],['=IF(1=1,42,1/0)',42],['=IF(FALSE,1/0,7)',7],['=ROUND(3.14159,2)',3.14],['=ABS(-9)',9],['=AND(TRUE,NOT(FALSE),2>1)',true],['=OR(FALSE,TRUE)',true]] as const)assert.deepEqual(f(source),want,source);
 assert.deepEqual(f('=1/0'),{error:'#DIV/0!'});assert.deepEqual(f('=1e308*10'),{error:'#NUM!'});assert.deepEqual(f('=MISSING(2)'),{error:'#NAME?'});assert.deepEqual(f('=1+'),{error:'#ERROR!'});assert.deepEqual(f('="bad"+2'),{error:'#VALUE!'});
});
test('E02 cross-sheet ranges, aggregation, conditionals and a real dependency chain',()=>{
 const e=make({Sheet1:{A1:'10',A2:'20',A3:'text',B1:'=A1*2',B2:'=SUM(A1:A3)',B3:'=B1+B2',C1:'=\'Sales data\'!$B$2+B3'},'Sales data':{B2:'4'}});
 assert.equal(e.cell('Sheet1',2,1),50);assert.equal(e.cell('Sheet1',0,2),54);
 for(const[source,want]of [['=SUM(A1:A3)',30],['=AVERAGE(A1:A3)',15],['=MIN(A1:A3)',10],['=MAX(A1:A3)',20],['=COUNT(A1:A3)',2],['=COUNTA(A1:A4)',3],['=COUNTIF(A1:A3,">15")',1],['=SUMIF(A1:A3,">15",B1:B3)',30]]as const)assert.equal(e.formula(source,'Sheet1'),want,source);
 assert.deepEqual(e.formula('=Missing!A1','Sheet1'),{error:'#REF!'});
});
test('E02 cycles, user errors and work limits never escape as JS exceptions',()=>{
 const e=make({Sheet1:{A1:'=B1',B1:'=A1',C1:'=C1',D1:'=C1+2',E1:"'=1+1",F1:'0007'}});
 for(const column of[0,1,2,3])assert.deepEqual(e.cell('Sheet1',0,column),{error:'#CYCLE!'});
 assert.equal(e.cell('Sheet1',0,4),'=1+1');assert.equal(e.cell('Sheet1',0,5),7);
 assert.deepEqual(e.formula('=SUM(A1:XFD1048576)','Sheet1'),{error:'#LIMIT!'});
 assert.deepEqual(e.formula('=globalThis.fetch("/private")','Sheet1'),{error:'#ERROR!'});
 assert.deepEqual(e.formula('=A0','Sheet1'),{error:'#REF!'});
 assert.deepEqual(e.formula('='+ '('.repeat(300)+'1'+')'.repeat(300),'Sheet1'),{error:'#LIMIT!'});
});
test('E02 reference translation honors absolute coordinates, sheet names and string literals',()=>{
 assert.deepEqual(sheetReferences.read("'Bob''s data'!$AA$12"),{sheet:"Bob's data",column:26,row:11,absoluteColumn:true,absoluteRow:true});
 const source='=SUM(A1,$A1,A$1,$A$1,\'Sales data\'!B2:B4)&"A1"';
 assert.equal(sheetReferences.shift(source,2,3),'=SUM(D3,$A3,D$1,$A$1,\'Sales data\'!E4:E6)&"A1"');
 assert.equal(sheetReferences.shift('=A1',-1,0),'=#REF!');assert.equal(sheetReferences.shift('text A1',2,3),'text A1');
 assert.equal(sheetReferences.write({row:0,column:16383,absoluteRow:false,absoluteColumn:false}),'XFD1');
 assert.throws(()=>parseFormula('=1+'.repeat(10000)));
});

test('E02 COUNT/COUNTA preserve reference, error and empty-text semantics',()=>{
 // Microsoft COUNT and COUNTA function contracts distinguish referenced errors and empty text from empty cells.
 const e=make({Sheet1:{A1:'=1/0',A2:'4',A3:'TRUE',A4:'word',A5:'=""',A6:'',A7:"'"}}),f=(s:string)=>e.formula(s,'Sheet1');
 assert.equal(f('=COUNT(A1:A8)'),1);assert.equal(f('=COUNTA(A1:A8)'),6);
 assert.equal(f('=COUNT(A1)'),0);assert.equal(f('=COUNTA(A1)'),1);assert.equal(f('=COUNTA(A6)'),0);assert.equal(f('=COUNTA(A5)'),1);
 assert.equal(f('=COUNT(TRUE,"2","bad",1/0,5)'),3);assert.equal(f('=COUNTA("",1/0,TRUE)'),3);
 assert.deepEqual(f('=SUM(A1:A2)'),{error:'#DIV/0!'});
 assert.equal(f('=SUM("2",TRUE,A2)'),7);assert.equal(f('=SUM(A3:A4)'),0);
 assert.deepEqual(f('=SUM("bad")'),{error:'#VALUE!'});
});

test('E02 conditional totals match literal wildcards and only propagate selected sum errors',()=>{
 const e=make({Sheet1:{A1:'a*b',A2:'axxb',A3:'a?b',A4:'17',A5:'*start',B1:'2',B2:'=1/0',B3:'3',B4:'4'}}),f=(s:string)=>e.formula(s,'Sheet1');
 assert.equal(f('=COUNTIF(A1:A4,"a~*b")'),1);assert.equal(f('=COUNTIF(A1:A4,"a~?b")'),1);
 assert.equal(f('=COUNTIF(A1:A5,"*")'),4);assert.equal(f('=COUNTIF(A1:A4,"a*b")'),3);assert.equal(f('=COUNTIF(A1:A5,"~*start")'),1);
 assert.equal(f('=SUMIF(A1:A4,"a~*b",B1:B4)'),2);assert.equal(f('=SUMIF(A1:A4,"no match",B1:B4)'),0);
 assert.deepEqual(f('=SUMIF(A1:A4,"axxb",B1:B4)'),{error:'#DIV/0!'});
 assert.deepEqual(f('=COUNTIF(A1:A4,1/0)'),{error:'#DIV/0!'});
 assert.deepEqual(f('=UNKNOWN(1/0)'),{error:'#NAME?'});
});

test('E02 resource limits bound derived text and wildcard work without poisoning later cells',()=>{
 const chain=createSheetEvaluator({sheets:['Sheet1'],read:(_,row)=>row<130?`=A${row+2}`:'7'});
 assert.deepEqual(chain.cell('Sheet1',0,0),{error:'#LIMIT!'});assert.equal(chain.cell('Sheet1',127,0),7);
 const doubling=createSheetEvaluator({sheets:['Sheet1'],read:(_,row)=>row?`=A${row}&A${row}`:'x'});
 assert.deepEqual(doubling.cell('Sheet1',20,0),{error:'#LIMIT!'});assert.equal((doubling.cell('Sheet1',14,0)as string).length,16384);
 const text='a'.repeat(8192),pattern='*'+'a'.repeat(256)+'b',e=make({Sheet1:{A1:text}});
 assert.deepEqual(e.formula(`=COUNTIF(A1,"${pattern}")`,'Sheet1'),{error:'#LIMIT!'});
 const cyclic=make({Sheet1:{A1:'=COUNT(A1)',A2:'=COUNTA(A2)'}});
 assert.deepEqual(cyclic.cell('Sheet1',0,0),{error:'#CYCLE!'});assert.deepEqual(cyclic.cell('Sheet1',1,0),{error:'#CYCLE!'});
 assert.deepEqual(e.formula('='+Array.from({length:200},()=>1).join('+'),'Sheet1'),{error:'#LIMIT!'});
 assert.deepEqual(e.formula('='+Array.from({length:2049},()=>1).join('+'),'Sheet1'),{error:'#LIMIT!'});
});

test('E02 canonical spreadsheet error literals remain typed through imported-cell references',()=>{
 const errors=['#NULL!','#DIV/0!','#VALUE!','#REF!','#NAME?','#NUM!','#N/A','#GETTING_DATA'];
 const data=Object.fromEntries(errors.map((error,i)=>[`A${i+1}`,`=${error}`])),e=make({Errors:data});
 for(const [row,error]of errors.entries()){
  assert.deepEqual(parseFormula(`=${error}`),{kind:'error',error});
  assert.deepEqual(e.cell('Errors',row,0),{error});
  assert.deepEqual(e.formula(`=A${row+1}+1`,'Errors'),{error});
 }
 assert.equal(e.formula('=COUNT(A1:A8)','Errors'),0);assert.equal(e.formula('=COUNTA(A1:A8)','Errors'),8);
});

test('E02 optional total-work budget bounds a batch while default interactive calls remain independent',()=>{
 const ports={sheets:['Sheet1'],read:()=> '1'},source='=SUM(A1:J10)';
 const bounded=createSheetEvaluator({...ports,maxTotalSteps:2000}),interactive=createSheetEvaluator(ports);
 assert.equal(bounded.formula(source,'Sheet1'),100);assert.equal(bounded.budgetExceeded(),false);
 for(let i=0;i<100;i++){
  assert.equal(interactive.formula(source,'Sheet1'),100);
  bounded.formula(source,'Sheet1');
 }
 assert.equal(interactive.budgetExceeded(),false);assert.equal(bounded.budgetExceeded(),true);
 assert.deepEqual(bounded.formula('=1','Sheet1'),{error:'#LIMIT!'});
 assert.deepEqual(bounded.cell('Sheet1',0,0),{error:'#LIMIT!'});
 const localLimit=createSheetEvaluator({...ports,maxTotalSteps:2000});
 assert.deepEqual(localLimit.formula('=SUM(A1:XFD1048576)','Sheet1'),{error:'#LIMIT!'});
 assert.equal(localLimit.budgetExceeded(),false);assert.equal(localLimit.formula('=2+3','Sheet1'),5);
 for(const limit of[0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>createSheetEvaluator({...ports,maxTotalSteps:limit}),RangeError);
});
