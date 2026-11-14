/**
 * PURPOSE    Format supported values for deterministic cell display.
 * KIND       CORE
 * CONTRACT   IN: SheetValue and optional validated cell format. OUT: display string. RAISES: no user-value errors; spreadsheet errors stay visible.
 * GUARANTEES Never changes source/formulas; fixed en-US numeric separators and ISO date text.
 * TUNING     0–8 decimal places from E01; Excel1900 date convention including serial60.
 * DECISIONS  D1: Explicit locale and date convention avoid machine-dependent workbook presentation. Alternative: using the browser locale. Revisit if: multiple currencies or locale-specific formats become required.
 * LIMITS     Currency is USD; no custom formats or1904 date system.
 * TESTBENCH  src/spreadsheet/sheet-display.test.ts -- node --import tsx --test src/spreadsheet/sheet-display.test.ts
 */
import {formatSheetValue,type SheetValue} from './sheet-formulas.ts';
import type {Workbook} from './workbook-document.ts';
export function displaySheetCell(value:SheetValue,format:Workbook['sheets'][number]['cells'][string]['format']):string{
 if(typeof value!=='number'||!format?.number||format.number==='general')return formatSheetValue(value);
 if(format.number==='date'){
  if(value===60)return'1900-02-29';const time=Date.UTC(1899,11,30)+(value<60?value+1:value)*86400000;
  if(!Number.isFinite(time)||Math.abs(time)>8.64e15)return'#NUM!';return new Date(time).toISOString().slice(0,10);
 }
 const decimals=format.decimals??2,settings:Intl.NumberFormatOptions={minimumFractionDigits:decimals,maximumFractionDigits:decimals};
 if(format.number==='currency')Object.assign(settings,{style:'currency',currency:'USD'});if(format.number==='percent')settings.style='percent';
 return new Intl.NumberFormat('en-US',settings).format(value);
}
