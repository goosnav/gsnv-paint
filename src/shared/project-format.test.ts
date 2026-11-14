import assert from 'node:assert/strict';
import test from 'node:test';
import { projectFormat, ProjectFormatError, type ProjectEnvelope } from './project-format.ts';

const example: ProjectEnvelope = {
  format: 'gsnv-cad', version: 1, id: 'plate', title: '',
  content: { width: 100, values: [null, true, false, 'inch'], depth: 10 },
};
const golden = '{"content":{"depth":10,"values":[null,true,false,"inch"],"width":100},"format":"gsnv-cad","id":"plate","title":"","version":1}';
const encodeUnknown = (project: unknown) => projectFormat({ op: 'encode', project: project as ProjectEnvelope });

test('S03 canonical literal golden and input immutability', () => {
  Object.freeze(example.content);
  Object.freeze(example);
  assert.equal(projectFormat({ op: 'encode', project: example }), golden);
  assert.deepEqual(projectFormat({ op: 'decode', text: golden }), example);
});

for (const format of ['gsnv-cad', 'gsnv-image', 'gsnv-video', 'gsnv-spreadsheet', 'gsnv-code'] as const) {
  test(`S03 ${format} preserves nested JSON content`, () => {
    const project: ProjectEnvelope = {
      ...example, format,
      content: { list: [[], {}, { unicode: 'é🪿\ud800\n\t"\\' }], numbers: [Number.MAX_VALUE, Number.MIN_VALUE, -0] },
    };
    assert.deepEqual(projectFormat({ op: 'decode', text: projectFormat({ op: 'encode', project }) }), project);
  });
}

test('S03 deterministic ordering property independent of record insertion order', () => {
  for (let seed = 0; seed < 40; seed++) {
    const entries = [['z', seed], ['10', [true, 'x']], ['2', { b: -0, a: seed }], ['a', null]] as const;
    const a = { ...example, content: Object.fromEntries(entries) } as ProjectEnvelope;
    const b = { content: Object.fromEntries([...entries].reverse()), title: '', id: 'plate', version: 1, format: 'gsnv-cad' } as ProjectEnvelope;
    assert.equal(projectFormat({ op: 'encode', project: a }), projectFormat({ op: 'encode', project: b }));
    assert.deepEqual(projectFormat({ op: 'decode', text: projectFormat({ op: 'encode', project: a }) }), a);
  }
  const numeric = { ...example, content: { '2': 2, '10': 10 } };
  assert.match(projectFormat({ op: 'encode', project: numeric }), /"content":\{"10":10,"2":2\}/);
});

test('S03 accepts shared references that are not ancestor cycles and null-prototype records', () => {
  const shared = Object.assign(Object.create(null) as Record<string, number>, { width: 40 });
  assert.deepEqual(projectFormat({ op: 'decode', text: encodeUnknown({ ...example, content: [shared, shared] }) }), {
    ...example, content: [{ width: 40 }, { width: 40 }],
  });
});

test('S03 valid deeply nested content does not depend on the JavaScript call stack', () => {
  const depth = 15000;
  const text = '{"content":' + '['.repeat(depth) + '0' + ']'.repeat(depth) + ',"format":"gsnv-cad","id":"plate","title":"","version":1}';
  const decoded = projectFormat({ op: 'decode', text });
  assert.equal(projectFormat({ op: 'encode', project: decoded }), text);
});

const invalidEnvelopes: unknown[] = [
  null, [], true, 42, 'text', {}, { ...example, extra: 1 },
  ...Object.keys(example).map(key => Object.fromEntries(Object.entries(example).filter(([field]) => key !== field))),
  { ...example, format: 'unknown' }, { ...example, version: 2 }, { ...example, version: '1' },
  { ...example, id: '' }, { ...example, id: 42 }, { ...example, title: null },
];
for (const [index, project] of invalidEnvelopes.entries()) {
  test(`S03 rejects invalid envelope ${index} on encode and decode`, () => {
    assert.throws(() => encodeUnknown(project), ProjectFormatError);
    assert.throws(() => projectFormat({ op: 'decode', text: JSON.stringify(project) }), ProjectFormatError);
  });
}

for (const key of ['__proto__', 'prototype', 'constructor']) {
  test(`S03 rejects unsafe own key ${key} at any depth`, () => {
    for (const content of [{ [key]: 1 }, { valid: [{ [key]: {} }] }]) {
      assert.throws(() => encodeUnknown({ ...example, content }), ProjectFormatError);
      assert.throws(() => projectFormat({ op: 'decode', text: JSON.stringify({ ...example, content }) }), ProjectFormatError);
    }
  });
}

const sparse = new Array(2);
const arrayExtra = Object.assign([1], { custom: 2 });
const withSymbol = { [Symbol('value')]: 1 };
const hidden = Object.defineProperty({}, 'hidden', { value: 1 });
const getter = Object.defineProperty({}, 'value', { enumerable: true, get() { throw new Error('must not execute'); } });
const cyclic: Record<string, unknown> = {};
cyclic.loop = cyclic;
const invalidContents = [undefined, NaN, Infinity, -Infinity, 1n, Symbol('x'), () => 1, new Date(0), new Map(),
  Object.create({ inherited: 1 }), sparse, [undefined], arrayExtra, withSymbol, hidden, getter, cyclic];
for (const [index, content] of invalidContents.entries()) {
  test(`S03 rejects non-JSON content ${index} without silent coercion`, () => {
    assert.throws(() => encodeUnknown({ ...example, content }), ProjectFormatError);
  });
}

for (const text of ['', '{', '{}garbage', golden.slice(0, -1), golden.replace('100', '1e400')]) {
  test(`S03 rejects malformed or nonfinite JSON text (${text.length} characters)`, () => {
    assert.throws(() => projectFormat({ op: 'decode', text }), ProjectFormatError);
  });
}

test('S03 invalid operation and text types use the documented error', () => {
  for (const request of [null, {}, { op: 'encode' }, { op: 'unknown' }, { op: 'decode', text: 42 }]) {
    assert.throws(() => projectFormat(request as Parameters<typeof projectFormat>[0]), ProjectFormatError);
  }
});

test('S03 64 MiB UTF-8 boundary is inclusive and counts bytes rather than code units', () => {
  const maxBytes = 64 * 1024 * 1024;
  const empty = { ...example, content: '' };
  const overhead = new TextEncoder().encode(projectFormat({ op: 'encode', project: empty })).length;
  const title = 'é';
  const content = 'x'.repeat(maxBytes - overhead - 2);
  const project = { ...empty, title, content };
  const encoded = projectFormat({ op: 'encode', project });
  assert.equal(new TextEncoder().encode(encoded).length, maxBytes);
  assert.deepEqual(projectFormat({ op: 'decode', text: encoded }), project);
  assert.throws(() => encodeUnknown({ ...project, content: content + 'x' }), ProjectFormatError);
  assert.throws(() => projectFormat({ op: 'decode', text: encoded + ' ' }), ProjectFormatError);
});
