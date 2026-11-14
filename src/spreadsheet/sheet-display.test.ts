import assert from 'node:assert/strict';
import test from 'node:test';
import {displaySheetCell} from './sheet-display.ts';
test('E04 cell display uses explicit numeric formats without changing values or errors',()=>{
 assert.equal(displaySheetCell(1234.5,{number:'currency',decimals:2}),'$1,234.50');
 assert.equal(displaySheetCell(.125,{number:'percent',decimals:1}),'12.5%');
 assert.equal(displaySheetCell(1234.5,{number:'number',decimals:0}),'1,235');
 assert.equal(displaySheetCell('0012',{number:'number'}),'0012');
 assert.equal(displaySheetCell({error:'#DIV/0!'},{number:'currency'}),'#DIV/0!');
 assert.equal(displaySheetCell(true,undefined),'TRUE');
});
test('E04 dates preserve the 1900 serial convention and expose out-of-range values',()=>{
 for(const [value,date]of [[0,'1899-12-31'],[59,'1900-02-28'],[60,'1900-02-29'],[61,'1900-03-01']] as const)assert.equal(displaySheetCell(value,{number:'date'}),date);
 assert.equal(displaySheetCell(1e100,{number:'date'}),'#NUM!');
});
