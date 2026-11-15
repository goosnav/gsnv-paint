import assert from 'node:assert/strict';
import test from 'node:test';
import { searchHelp, type HelpCommand } from './help-index.ts';

const commands: readonly HelpCommand[] = Object.freeze([
  Object.freeze({ id: 'image.text', label: 'Text', workspace: 'image' as const, path: Object.freeze(['Tool palette']), shortcut: 'T', enabled: true, showMe: true }),
  Object.freeze({ id: 'file.open', label: 'Open', workspace: 'image' as const, path: Object.freeze(['File']), shortcut: 'Ctrl+O', enabled: true }),
  Object.freeze({ id: 'cad.text', label: 'Text reference', workspace: 'cad' as const, path: Object.freeze(['Sketch']), enabled: true }),
]);

test('HELP-INDEX font synonyms lead to the actual local font workflow', () => {
  for (const query of ['font', 'custom font', 'TTF', 'otf', 'typeface', 'TrueType', 'OpenType']) {
    const result = searchHelp({ query, workspace: 'image', commands }).find(entry => entry.id === 'help.fonts');
    assert.ok(result, query); assert.equal(result.commandId, 'image.text'); assert.equal(result.available, true);
    assert.ok(result.steps.join(' ').includes('Import font…')); assert.ok(result.steps.join(' ').includes('click the canvas'));
    assert.ok(result.steps.join(' ').includes('on this device'));
  }
});

test('HELP-INDEX current workspace sorts first and exposes command locations without executing', () => {
  const results = searchHelp({ query: 'text', workspace: 'image', commands });
  assert.equal(results[0]?.workspace, 'image');
  const image = results.find(result => result.id === 'command:image:image.text')!;
  const cad = results.find(result => result.id === 'command:cad:cad.text')!;
  assert.ok(results.indexOf(image) < results.indexOf(cad)); assert.match(image.steps.join(' '), /Tool palette/);
  assert.equal(image.available, true); assert.equal(cad.available, false);
  const open = searchHelp({ query: 'Ctrl+O', workspace: 'image', commands }).find(result => result.id === 'command:image:file.open');
  assert.equal(open?.available, false, 'opening a file is never an implicit help action');
});

test('HELP-INDEX results are deeply immutable, caller-owned metadata is untouched, and actions are allowlisted', () => {
  const before = JSON.stringify(commands); const results = searchHelp({ query: '', workspace: 'image', commands });
  assert.equal(JSON.stringify(commands), before); assert.ok(Object.isFrozen(results));
  for (const result of results) { assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.steps)); assert.ok(Object.isFrozen(result.keywords)); }
  const missing = searchHelp({ query: 'otf', workspace: 'image', commands: [] })[0]!;
  assert.equal(missing.available, false); assert.equal(missing.commandId, undefined);
  const disabled = searchHelp({ query: 'otf', workspace: 'image', commands: [{ ...commands[0]!, enabled: false }] })[0]!;
  assert.equal(disabled.available, false);
  assert.deepEqual(searchHelp({ query: 'unmatchedword987654', workspace: 'image', commands }), []);
});

test('HELP-INDEX all query words must match, spelling accents normalize, and article sections stay explicit', () => {
  assert.ok(searchHelp({ query: '  CUSTOM   FÓNT  ', workspace: 'image', commands }).some(result => result.id === 'help.fonts'));
  assert.deepEqual(searchHelp({ query: 'font unmatchedword987654', workspace: 'image', commands }), []);
  const results = searchHelp({ query: '', workspace: 'image', commands });
  assert.ok(results.some(result => result.section === 'faq')); assert.ok(results.some(result => result.section === 'getting-started'));
  assert.ok(results.some(result => result.id === 'help.automation'));
  assert.ok(results.some(result => result.id === 'help.batch'));
  for (const query of ['dithering', 'down-pixel', 'JavaScript', 'timestamp']) assert.ok(searchHelp({query,workspace:'image',commands}).some(result=>result.kind==='article'),query);
});

test('HELP-INDEX rejects invalid metadata and duplicate workspace command IDs before indexing', () => {
  for (const patch of [{ query: 1 }, { workspace: 'bad' }, { commands: [{}] }, { commands: [commands[0], commands[0]] }, { commands: [{ ...commands[0], path: ['File', 1] }] }]) {
    assert.throws(() => searchHelp({ query: '', workspace: 'image', commands, ...patch } as never), TypeError);
  }
});
