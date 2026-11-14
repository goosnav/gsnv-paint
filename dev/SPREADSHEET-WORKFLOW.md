# Spreadsheet workspace — implementation contract

Authority: `MODULE_MAP-AUTHORING.md`, SHEET-001–003. This is an implementation ledger, not a completion claim.

E02 is split into `sheet-references` (A1 parsing/rendering/fill), `sheet-parser` (bounded expression AST), and `sheet-formulas` (read-only recalculation). Formula source is never passed to JavaScript evaluation. Values are numbers, text, booleans or explicit error objects. Empty cells display blank and coerce to zero in arithmetic; aggregate ranges ignore text. IF evaluates only its selected branch. Circular dependencies produce `#CYCLE!`, malformed formulas `#ERROR!`, unknown functions `#NAME?`, invalid references `#REF!`, division by zero `#DIV/0!`, type mismatches `#VALUE!`, and nonfinite results `#NUM!`. Formula length, recursion and range work are bounded; excess work is a visible `#LIMIT!` error. Quoted sheet names and absolute row/column references survive fill. Source formulas remain editable even when unsupported.

E01 stores sparse cells keyed by A1 address, with raw input strings and explicit basic style/number formats. It owns immutable sheet/range edits, structural reference changes and sort/filter policy. E03 maps only supported values/formulas/basic formats to pinned SheetJS CE; unsupported features produce a diagnostic. E04 owns DOM grid virtualization, selection and pending input flushing through shared history.

Golden tests use literal values and formulas. The production browser workflow demonstrates range edits, undo, formulas, sort/filter, sheet navigation and editable native save/reopen. Real XLSX files preserve formulas, cached values and supported styles; native projects preserve every supported field. SHEET-001–003 pass this bounded contract; this is not general Excel compatibility or owner acceptance.

## Using the workspace

Choose Spreadsheet, then New workbook. Type directly into a cell, press F2 to edit its existing input, or use the formula bar. Enter confirms; Escape cancels. Shift+arrows or a pointer drag selects a range. The address box jumps to a cell or range such as `AZ999` or `A1:D12`. Copy/paste retains relative formulas within the workbook; pasted tab-separated text fills a range. Right-click offers the same cell actions as the menus.

Cells provides fill, insert/delete and typed row/column sizing. Data sorts selected records and filters by a text query; mark the first row as a heading when sorting a table. The right panel changes number format, decimal places, alignment, bold/italic and colors. Sheet tabs and Workbook commands add, rename, reorder or delete sheets. File Save creates an editable `.gsnv-spreadsheet`; Workbook exports XLSX or the active sheet as CSV.

## Interchange and limits

The native version1 envelope contains schema1 JSON: ordered sheets with stable IDs/names, row/column counts, sparse A1 cells (`input`, optional `format`), row heights, column widths and optional filter. There are no binary assets or automatic external links. Input stays source text, including formulas; computed values are disposable.

Limits are 32 sheets, 10,000 rows and 256 columns per sheet, 50,000 stored cells, and 8,192 characters per cell input. Derived formula text is capped at 32,767 characters. Each calculation has a 250,000-step bound; file operations share a two-million-step budget and abort visibly if exceeded. A failed import retains the current workbook. Clipboard input/output is limited to 4 MiB and 50,000 cells. Display/filter, sort and copy calculations also have a two-million-step budget. A rejected filter shows all rows with a visible explanation; a failed copy never clears cells for Cut.

CSV/XLSX files are capped at 20 MiB, expanded ZIP content at 64 MiB and 4,096 entries. Export charges text while assembling it, with a 20 MiB payload bound before vendor rendering; final ZIP size is checked again. CSV permits one million used cell positions; XLSX permits five million across sheets. These bounds prevent sparse or formula-heavy workbooks from creating unbounded exports.

CSV exports computed values from one sheet, escapes formula-like text and preserves quoted UTF-8 fields. XLSX preserves editable formulas, text/number/boolean types, sheet names, bold/italic, RGB fills/text, alignment, supported number formats and row/column sizes. Unsupported formulas remain editable with visible errors. Macros, links, charts, embedded images, merged cells, comments, named ranges, borders and unsupported styles produce diagnostics. A 1904-date workbook is rejected with instructions to convert its date system; silently shifting dates is unacceptable. Currency formatting currently uses USD and numeric separators use en-US.

## Verification

`node --import tsx --test src/spreadsheet/*.test.ts`: 33 tests pass, zero failures or skips. The modular checker passes all 11 implementation files.

`SHEET_PRODUCTION=1 npx playwright test --config src/spreadsheet/spreadsheet.playwright.config.ts`: 3 tests pass on Linux x64 Chrome154 at1280×720. They exercise keyboard/pointer ranges, fill/reference translation, formatting, sort/filter, sheet edits, pending-input save, native recovery, real XLSX/CSV downloads and reimports, invalid-file retention, typed-size preview/cancel and distant virtual cells. Cross-origin isolation is asserted; captured page/console errors and external HTTP requests are empty. The production screenshot was inspected. Native OS pickers and other browser/OS combinations remain untested.
