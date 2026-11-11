import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateVariables, type VariableRequest } from './named-variables.ts';
import { evaluateDimension } from './dimension-expressions.ts';

type Definition = VariableRequest['variables'][number];
type Kind = Definition['expression']['kind'];
const definition = (name: string, source: string, kind: Kind = 'scalar'): Definition => ({ name, expression: { source, kind } });
const evaluate = (variables: readonly Definition[], units: VariableRequest['units'] = 'mm') => evaluateVariables({ variables, units });
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
type Located = Error & { variable: string; offset: number; token: string; cycle: string[]; cause: Error & { offset: number; token: string } };
function failure(variables: readonly Definition[], units: VariableRequest['units'] = 'mm'): Located {
  let caught: unknown;
  try { evaluate(variables, units); } catch (cause) { caught = cause; }
  assert.ok(caught instanceof Error, 'Expected a public contract error'); return caught as Located;
}
function expressionFailure(variables: readonly Definition[], name: string, variable: string, offset: number, token: string) {
  const caught = failure(variables);
  assert.equal(caught.name, name); assert.equal(caught.variable, variable); assert.equal(caught.offset, offset); assert.equal(caught.token, token);
  assert.ok(caught.message.includes(variable)); assert.ok(caught.cause instanceof Error); assert.notEqual(caught.cause, caught);
  assert.equal(caught.cause.name, name); assert.equal(caught.cause.offset, offset); assert.equal(caught.cause.token, token);
  assert.ok(caught.message.includes(caught.cause.message)); return caught;
}

test('C04 empty input yields a complete empty context and graph', () => {
  for (const units of ['mm', 'inch'] as const) assert.deepEqual(plain(evaluate([], units)), { context: { units, variables: {} }, order: [], dependents: {} });
});

test('C04 full reversed-chain golden resolves forty to twenty to ten', () => {
  assert.deepEqual(plain(evaluate([definition('quarter', 'half/2', 'length'), definition('half', 'width/2', 'length'), definition('width', '40', 'length')])), {
    context: { units: 'mm', variables: { width: { value: 40, kind: 'length' }, half: { value: 20, kind: 'length' }, quarter: { value: 10, kind: 'length' } } },
    order: ['width', 'half', 'quarter'], dependents: { width: ['half'], half: ['quarter'], quarter: [] },
  });
});

test('C04 full diamond golden follows expression encounter order and direct consumers', () => {
  assert.deepEqual(plain(evaluate([definition('total', 'right+left', 'length'), definition('left', 'base*2', 'length'),
    definition('right', 'base*3', 'length'), definition('base', '10', 'length')])), {
    context: { units: 'mm', variables: { base: { value: 10, kind: 'length' }, right: { value: 30, kind: 'length' },
      left: { value: 20, kind: 'length' }, total: { value: 50, kind: 'length' } } },
    order: ['base', 'right', 'left', 'total'], dependents: { base: ['left', 'right'], right: ['total'], left: ['total'], total: [] },
  });
});

test('C04 independent roots retain source order rather than lexical order', () => {
  const result = evaluate([definition('zeta', '3'), definition('Alpha', '1'), definition('_middle', '2')]);
  assert.deepEqual(result.order, ['zeta', 'Alpha', '_middle']);
  assert.deepEqual(plain(result.dependents), { zeta: [], Alpha: [], _middle: [] });
});

test('C04 reverse edges are unique lexical direct consumers including zero-weight references', () => {
  const result = evaluate([definition('z', 'base+base'), definition('A', 'base'), definition('a2', '0*base+1'),
    definition('a10', 'base-base'), definition('top', 'z+A'), definition('base', '5')]);
  assert.deepEqual(result.dependents.base, ['A', 'a10', 'a2', 'z']); assert.deepEqual(result.dependents.z, ['top']);
  assert.deepEqual(result.dependents.A, ['top']); assert.deepEqual(result.dependents.top, []);
  assert.equal(result.context.variables.a2!.value, 1); assert.equal(result.context.variables.a10!.value, 0);
  assert.equal(result.order.filter(name => name === 'base').length, 1);
});

test('C04 canonical inch and angle values feed the actual public C03 evaluator', () => {
  const result = evaluate([definition('ratio', 'half/width'), definition('half', 'width/2', 'length'),
    definition('width', '2', 'length'), definition('turn', '180', 'angle')], 'inch');
  assert.deepEqual(plain(result), {
    context: { units: 'inch', variables: { width: { value: 50.8, kind: 'length' }, half: { value: 25.4, kind: 'length' },
      ratio: { value: 0.5, kind: 'scalar' }, turn: { value: Math.PI, kind: 'angle' } } },
    order: ['width', 'half', 'ratio', 'turn'], dependents: { width: ['half', 'ratio'], half: ['ratio'], ratio: [], turn: [] },
  });
  assert.deepEqual(evaluateDimension({ expression: { source: 'half+1', kind: 'length' }, context: result.context }),
    { value: 50.8, kind: 'length', dependencies: ['half'] });
  assert.deepEqual(evaluateDimension({ expression: { source: 'turn/2', kind: 'angle' }, context: result.context }),
    { value: Math.PI / 2, kind: 'angle', dependencies: ['turn'] });
});

test('C04 unit suffixes and scientific notation never become graph dependencies', () => {
  const result = evaluate([definition('length', '2in', 'length'), definition('amount', '1e3 + extra'), definition('extra', '2')]);
  assert.deepEqual(result.order, ['length', 'extra', 'amount']);
  assert.deepEqual(plain(result.dependents), { length: [], amount: [], extra: ['amount'] });
  assert.equal(result.context.variables.length!.value, 50.8); assert.equal(result.context.variables.amount!.value, 1002);
});

test('C04 case-sensitive names coexist and duplicate names identify the repeated name', () => {
  const result = evaluate([definition('width', '1'), definition('Width', '2'), definition('MM', '3')]);
  assert.deepEqual(result.order, ['width', 'Width', 'MM']); assert.equal(result.context.variables.Width!.value, 2);
  for (const name of ['width', '__proto__', 'constructor']) {
    const caught = failure([definition(name, '1'), definition(name, '2')]);
    assert.equal(caught.name, 'DuplicateNameError'); assert.equal(caught.variable, name);
  }
});

test('C04 every reserved unit name is rejected during preflight', () => {
  for (const name of ['mm', 'inch', 'in', 'deg', 'rad', '°']) {
    const caught = failure([definition(name, '1')]); assert.equal(caught.name, 'ReservedNameError'); assert.equal(caught.variable, name);
  }
});

test('C04 preflight precedes expression errors and preserves input-order validation', () => {
  const duplicate = failure([definition('bad', '1/0'), definition('a', '1'), definition('a', '2'), definition('mm', '3')]);
  assert.equal(duplicate.name, 'DuplicateNameError'); assert.equal(duplicate.variable, 'a');
  const reserved = failure([definition('bad', 'missing'), definition('a', '1'), definition('mm', '3'), definition('a', '2')]);
  assert.equal(reserved.name, 'ReservedNameError'); assert.equal(reserved.variable, 'mm');
});

test('C04 a self cycle reports its closing definition and reference', () => {
  const caught = failure([definition('alpha', '  alpha+1')]);
  assert.equal(caught.name, 'VariableCycleError'); assert.equal(caught.variable, 'alpha');
  assert.deepEqual(caught.cycle, ['alpha', 'alpha']); assert.equal(caught.offset, 2); assert.equal(caught.token, 'alpha');
});

test('C04 cycle paths exclude active prefixes and follow reference encounter order', () => {
  const caught = failure([definition('prefix', 'a'), definition('a', 'b'), definition('b', '  a+1')]);
  assert.equal(caught.name, 'VariableCycleError'); assert.equal(caught.variable, 'b');
  assert.deepEqual(caught.cycle, ['a', 'b', 'a']); assert.equal(caught.offset, 2); assert.equal(caught.token, 'a');
  const first = failure([definition('top', 'right+left'), definition('left', 'left'), definition('right', 'top')]);
  assert.equal(first.variable, 'right'); assert.deepEqual(first.cycle, ['top', 'right', 'top']); assert.equal(first.offset, 0); assert.equal(first.token, 'top');
});

test('C04 zero-weight references still cause cycles or missing-name errors', () => {
  const caught = failure([definition('a', '0*b'), definition('b', 'a')]);
  assert.equal(caught.name, 'VariableCycleError'); assert.equal(caught.variable, 'b'); assert.deepEqual(caught.cycle, ['a', 'b', 'a']);
  expressionFailure([definition('a', '0*missing+1')], 'UnknownVariableError', 'a', 2, 'missing');
});

test('C04 all C03 error families retain location, original cause and defining variable', () => {
  for (const [source, kind, name, offset, token] of [
    ['2+', 'scalar', 'ExpressionSyntaxError', 2, ''], ['missing+1', 'scalar', 'UnknownVariableError', 0, 'missing'],
    ['1mm+1deg', 'length', 'UnitMismatchError', 3, '+'], ['1/0', 'scalar', 'DivisionByZeroError', 1, '/'],
    ['1e309', 'scalar', 'NonFiniteValueError', 0, '1e309'],
  ] as const) expressionFailure([definition('badDefinition', source, kind)], name, 'badDefinition', offset, token);
});

test('C04 errors name the failed prerequisite rather than the requesting root', () => {
  expressionFailure([definition('outer', 'inner+1', 'length'), definition('inner', '\u2003 1mm + 1deg', 'length')], 'UnitMismatchError', 'inner', 6, '+');
  expressionFailure([definition('outer', 'inner+1'), definition('inner', 'outside+1')], 'UnknownVariableError', 'inner', 0, 'outside');
});

test('C04 arithmetic failures and reached cycles retain C03 encounter precedence', () => {
  expressionFailure([definition('a', '1/0 + b'), definition('b', 'a')], 'DivisionByZeroError', 'a', 1, '/');
  const caught = failure([definition('a', 'b + 1/0'), definition('b', 'a')]);
  assert.equal(caught.name, 'VariableCycleError'); assert.equal(caught.variable, 'b'); assert.deepEqual(caught.cycle, ['a', 'b', 'a']);
  expressionFailure([definition('first', 'missing'), definition('cycle', 'cycle')], 'UnknownVariableError', 'first', 0, 'missing');
});

test('C04 a scalar variable stays explicit at later dimension boundaries', () => {
  expressionFailure([definition('length', 'count', 'length'), definition('count', '2')], 'UnitMismatchError', 'length', 0, 'count');
});

test('C04 prototype-looking names are own data keys, while undeclared inherited names fail', () => {
  const result = evaluate([definition('sum', '__proto__+constructor+toString'), definition('constructor', '2'), definition('__proto__', '1'), definition('toString', '3')]);
  assert.deepEqual(result.order, ['__proto__', 'constructor', 'toString', 'sum']); assert.equal(result.context.variables.sum!.value, 6);
  for (const name of ['__proto__', 'constructor', 'toString']) {
    assert.equal(Object.hasOwn(result.context.variables, name), true); assert.equal(Object.hasOwn(result.dependents, name), true);
    assert.deepEqual(result.dependents[name], ['sum']);
  }
  expressionFailure([definition('sum', 'toString+1')], 'UnknownVariableError', 'sum', 0, 'toString');
});

test('C04 frozen inputs remain unchanged and repeated results share no mutable output state', () => {
  const request: VariableRequest = Object.freeze({ units: 'mm' as const, variables: Object.freeze([
    Object.freeze({ name: 'half', expression: Object.freeze({ source: 'width/2', kind: 'length' as const }) }),
    Object.freeze({ name: 'width', expression: Object.freeze({ source: '40', kind: 'length' as const }) }),
  ]) });
  const before = JSON.stringify(request), first = evaluateVariables(request), second = evaluateVariables(request);
  first.order.reverse(); first.dependents.width!.push('poison');
  (first.context.variables.width as { value: number }).value = 999;
  assert.equal(JSON.stringify(request), before); assert.deepEqual(second.order, ['width', 'half']);
  assert.deepEqual(second.dependents.width, ['half']); assert.equal(second.context.variables.width!.value, 40);
  assert.deepEqual(plain(evaluateVariables(request)), plain(second));
});

test('C04 a source edit recomputes its values and public C03 seam without mutating the prior result', () => {
  const before = evaluate([definition('half', 'width/2', 'length'), definition('width', '40', 'length')]);
  const after = evaluate([definition('half', 'width/2', 'length'), definition('width', '60', 'length')]);
  assert.equal(before.context.variables.half!.value, 20); assert.equal(after.context.variables.half!.value, 30);
  assert.equal(evaluateDimension({ expression: { source: 'half+1', kind: 'length' }, context: before.context }).value, 21);
  assert.equal(evaluateDimension({ expression: { source: 'half+1', kind: 'length' }, context: after.context }).value, 31);
  assert.equal(before.context.variables.width!.value, 40); assert.deepEqual(after.dependents.width, ['half']);
});

test('C04 deterministic independent-root reordering preserves values and direct edges', () => {
  for (let base = -12; base <= 12; base++) {
    const first = [definition('total', 'right+left'), definition('left', 'base*2'), definition('right', 'base*3'), definition('base', String(base)), definition('island', '7')];
    const second = [first[4]!, first[0]!, first[3]!, first[2]!, first[1]!];
    const a = evaluate(first), b = evaluate(second);
    assert.equal(a.context.variables.total!.value, base * 5 || 0);
    assert.deepEqual(plain(a.context), plain(b.context)); assert.deepEqual(plain(a.dependents), plain(b.dependents));
    assert.deepEqual(a.order, ['base', 'right', 'left', 'total', 'island']); assert.deepEqual(b.order, ['island', 'base', 'right', 'left', 'total']);
    assert.deepEqual(plain(a), plain(evaluate(first)));
  }
});

test('C04 explicit units remain canonical across document-unit settings', () => {
  const definitions = [definition('half', 'width/2', 'length'), definition('width', '2in', 'length'), definition('angle', '180deg', 'angle')];
  const mm = evaluate(definitions, 'mm'), inch = evaluate(definitions, 'inch');
  assert.deepEqual(plain(mm.context.variables), plain(inch.context.variables)); assert.deepEqual(mm.order, inch.order);
  assert.deepEqual(plain(mm.dependents), plain(inch.dependents)); assert.equal(mm.context.units, 'mm'); assert.equal(inch.context.units, 'inch');
});

test('C04 a deep reversed chain resolves iteratively with exact integer values and direct edges', () => {
  const count = 12_000, definitions: Definition[] = [];
  for (let index = count - 1; index >= 0; index--) definitions.push(definition(`v${index}`, index === 0 ? '0' : `v${index - 1}+1`));
  const result = evaluate(definitions);
  assert.equal(result.order.length, count); assert.equal(Object.keys(result.context.variables).length, count); assert.equal(Object.keys(result.dependents).length, count);
  for (let index = 0; index < count; index++) {
    const name = `v${index}`; assert.equal(result.order[index], name); assert.equal(result.context.variables[name]!.value, index);
    assert.equal(result.context.variables[name]!.kind, 'scalar'); assert.deepEqual(result.dependents[name], index + 1 === count ? [] : [`v${index + 1}`]);
  }
});
