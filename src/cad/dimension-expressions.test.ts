import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDimension, type DimensionRequest } from './dimension-expressions.ts';

type Kind = DimensionRequest['expression']['kind'];
type Units = DimensionRequest['context']['units'];
type Variables = DimensionRequest['context']['variables'];
const variables: Variables = { width: { value: 40, kind: 'length' }, height: { value: 20, kind: 'length' },
  gap: { value: 5, kind: 'length' }, angle: { value: Math.PI / 2, kind: 'angle' }, s: { value: 2, kind: 'scalar' } };
const evaluate = (source: string, kind: Kind = 'scalar', units: Units = 'mm', names: Variables = variables) =>
  evaluateDimension({ expression: { source, kind }, context: { units, variables: names } });
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) <= 8 * Number.EPSILON * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);

test('C03 unit binding preserves arithmetic and variable dependencies in either unit system', () => {
  for (const units of ['mm', 'inch'] as const) {
    for (const [source, kind] of [
      ['40', 'length'], [' width / 2 ', 'length'], ['width + 2', 'length'], ['2 + width + 3', 'length'],
      ['-(2 + 3) * 4', 'length'], ['width + (10 / 2)', 'length'], ['2 * width + 4 × (2+3)', 'length'],
      ['((2+3)*4)', 'length'], ['width + --2 + (height - 3)', 'length'], ['1inch + 2mm', 'length'],
      ['90', 'angle'], ['angle + 90', 'angle'], ['(width / height) + 2', 'scalar'],
    ] as const) {
      const result = evaluateDimension({ expression: { source, kind }, context: { units, variables }, bindUnits: true });
      assert.equal(typeof result.boundSource, 'string');
      for (const next of ['mm', 'inch'] as const) {
        const bound = evaluate(result.boundSource!, kind, next);
        near(bound.value, result.value); assert.deepEqual(bound.dependencies, result.dependencies);
      }
      const rebound = evaluateDimension({ expression: { source: result.boundSource!, kind }, context: { units, variables }, bindUnits: true });
      assert.equal(rebound.boundSource, result.boundSource, 'binding twice adds nothing');
    }
  }
  const source = 'width / 2';
  const bound = evaluateDimension({ expression: { source, kind: 'length' }, context: { units: 'mm', variables }, bindUnits: true });
  assert.equal(bound.boundSource, source);
  assert.equal(evaluate(bound.boundSource!, 'length', 'inch', { ...variables, width: { kind: 'length', value: 80 } }).value, 40);
});
function error(source: string, name: string, offset: number, token: string, kind: Kind = 'scalar', units: Units = 'mm', names: Variables = variables) {
  assert.throws(() => evaluate(source, kind, units, names), (cause: unknown) => {
    assert.ok(cause instanceof Error); assert.equal(cause.name, name);
    const located = cause as Error & { offset: number; token: string };
    assert.equal(located.offset, offset); assert.equal(located.token, token); return true;
  });
}

test('C03 full golden values preserve canonical variables, field kinds and dependency order', () => {
  assert.deepEqual(evaluate('width / 2 + gap * 2', 'length', 'inch'), { value: 30, kind: 'length', dependencies: ['gap', 'width'] });
  assert.deepEqual(evaluate('width / height + 2'), { value: 4, kind: 'scalar', dependencies: ['height', 'width'] });
  assert.deepEqual(evaluate('10 / 2', 'length', 'inch'), { value: 127, kind: 'length', dependencies: [] });
  assert.deepEqual(evaluate('180deg', 'angle'), { value: Math.PI, kind: 'angle', dependencies: [] });
});

test('C03 decimal and scientific literals retain normal numeric meaning', () => {
  for (const [source, expected] of [['0', 0], ['1.', 1], ['.5', 0.5], ['001.50', 1.5], ['1e2', 100], ['1E-2', 0.01], ['2.5e+2', 250]] as const) {
    assert.deepEqual(evaluate(source), { value: expected, kind: 'scalar', dependencies: [] });
  }
});

test('C03 unary signs, glyph aliases, precedence and left associativity', () => {
  for (const [source, expected] of [['2+3*4', 14], ['(2+3)*4', 20], ['20-3-2', 15], ['24/4/2', 3], ['8/2*2', 8],
    ['--2', 2], ['-+2', -2], ['2*-3', -6], ['1--2', 3], ['-(2+3)*4', -20], ['8÷2×3−1', 11], ['−(−2)', 2]] as const) {
    assert.equal(evaluate(source).value, expected, source);
  }
});

test('C03 fixed explicit unit definitions ignore document units', () => {
  for (const units of ['mm', 'inch'] as const) {
    for (const [source, expected] of [['1mm', 1], ['1 in', 25.4], ['1inch', 25.4], ['1inch + 25.4mm', 50.8], ['-2mm', -2]] as const) {
      const result = evaluate(source, 'length', units); near(result.value, expected); assert.equal(result.kind, 'length'); assert.deepEqual(result.dependencies, []);
    }
    for (const [source, expected] of [['180deg', Math.PI], ['90°', Math.PI / 2], ['1 rad', 1], ['90deg + 90°', Math.PI]] as const) {
      near(evaluate(source, 'angle', units).value, expected);
    }
  }
});

test('C03 bare-only arithmetic adopts document length or degrees only when needed', () => {
  for (const [units, factor] of [['mm', 1], ['inch', 25.4]] as const) {
    near(evaluate('2 + 3 * 4', 'length', units).value, 14 * factor);
    near(evaluate('(10/2)', 'length', units).value, 5 * factor);
    near(evaluate('width + 2', 'length', units).value, 40 + 2 * factor);
    near(evaluate('2 + width', 'length', units).value, 2 * factor + 40);
    near(evaluate('width - 2', 'length', units).value, 40 - 2 * factor);
    near(evaluate('2 - width', 'length', units).value, 2 * factor - 40);
    near(evaluate('width + (10/2)', 'length', units).value, 40 + 5 * factor);
    near(evaluate('90', 'angle', units).value, Math.PI / 2);
    near(evaluate('angle + 90', 'angle', units).value, Math.PI);
  }
});

test('C03 scalar factors and like-dimensional ratios obey dimension rules', () => {
  for (const units of ['mm', 'inch'] as const) {
    for (const [source, expected] of [['width/2', 20], ['2*width', 80], ['width*s', 80], ['width/s', 20], ['(2+3)*width', 200]] as const) {
      near(evaluate(source, 'length', units).value, expected);
    }
    near(evaluate('angle * s', 'angle', units).value, Math.PI);
    assert.equal(evaluate('width / height', 'scalar', units).value, 2);
    assert.equal(evaluate('angle / angle', 'scalar', units).value, 1);
    assert.equal(evaluate('2in / 25.4mm', 'scalar', units).value, 2);
  }
});

test('C03 explicit scalar results never implicitly become dimensions', () => {
  for (const source of ['s+2', 's*2', 's/2', '2+s', '2*s', '2/s']) error(source, 'UnitMismatchError', 1, source[1]!, 'length');
  error('(width/width)+2', 'UnitMismatchError', 13, '+', 'length');
  error('s*0', 'UnitMismatchError', 1, '*', 'length');
  error('(width/width)*0', 'UnitMismatchError', 13, '*', 'length');
  error('width/height', 'UnitMismatchError', 5, '/', 'length');
  error('s', 'UnitMismatchError', 0, 's', 'angle');
  assert.equal(evaluate('(width/width)+2').value, 3);
});

test('C03 incompatible kinds and compound dimensions identify their original operator', () => {
  for (const [source, offset, token] of [['width+angle', 5, '+'], ['width+s', 5, '+'], ['s+width', 1, '+'], ['width*height', 5, '*'],
    ['width/angle', 5, '/'], ['2/width', 1, '/'], ['width×height', 5, '×'], ['width÷angle', 5, '÷'], ['1mm+2deg', 3, '+']] as const) {
    error(source, 'UnitMismatchError', offset, token, 'length');
  }
});

test('C03 final field mismatch identifies the sole operand or root operator', () => {
  error('  2mm', 'UnitMismatchError', 2, '2');
  error('(width)', 'UnitMismatchError', 1, 'width', 'angle');
  error('-width', 'UnitMismatchError', 0, '-', 'angle');
  error('width/2', 'UnitMismatchError', 5, '/');
  error('width + gap', 'UnitMismatchError', 6, '+', 'angle');
  error('90°', 'UnitMismatchError', 0, '90', 'length');
});

test('C03 dependencies are unique lexically sorted and include zero-weight references', () => {
  const names: Variables = { z: { value: 1, kind: 'length' }, A: { value: 2, kind: 'length' }, _x: { value: 3, kind: 'length' },
    a2: { value: 4, kind: 'length' }, a10: { value: 5, kind: 'length' }, unused: { value: 99, kind: 'length' } };
  assert.deepEqual(evaluate('z + A + _x + a2 + a10 + z - z', 'length', 'mm', names), { value: 15, kind: 'length', dependencies: ['A', '_x', 'a10', 'a2', 'z'] });
  assert.deepEqual(evaluate('0*z+A', 'length', 'mm', names), { value: 2, kind: 'length', dependencies: ['A', 'z'] });
  error('missing-missing', 'UnknownVariableError', 0, 'missing');
});

test('C03 own-property variables, identifier case and reserved unit names', () => {
  error('Width', 'UnknownVariableError', 0, 'Width', 'length');
  error('toString', 'UnknownVariableError', 0, 'toString', 'scalar', 'mm', {});
  error('__proto__', 'UnknownVariableError', 0, '__proto__', 'scalar', 'mm', {});
  const own = JSON.parse('{"__proto__":{"value":3,"kind":"scalar"},"constructor":{"value":4,"kind":"scalar"},"inside":{"value":5,"kind":"scalar"}}') as Variables;
  assert.deepEqual(evaluate('__proto__+constructor+inside', 'scalar', 'mm', own), { value: 12, kind: 'scalar', dependencies: ['__proto__', 'constructor', 'inside'] });
  for (const name of ['mm', 'inch', 'in', 'deg', 'rad']) error(name, 'ExpressionSyntaxError', 0, name, 'scalar', 'mm', {});
});

test('C03 JS whitespace is accepted without losing original source positions', () => {
  assert.equal(evaluate('\uFEFF\t .5 \n +\u00a0 1.\u2028').value, 1.5);
  error('\u2003\t 2 + missing', 'UnknownVariableError', 7, 'missing');
  error(' \n width ÷ 0', 'DivisionByZeroError', 9, '÷', 'length');
  error('\t (width + angle)', 'UnitMismatchError', 9, '+', 'length');
});

test('C03 finite input underflow and either signed zero produce finite positive zero', () => {
  for (const source of ['0', '-0', '0*-1', '1e-324', '1e-308*1e-308']) {
    const result = evaluate(source); assert.equal(result.value, 0); assert.equal(Object.is(result.value, -0), false);
  }
  assert.equal(evaluate('5e-324').value, Number.MIN_VALUE);
  const dimensionZero = evaluate('0mm-0mm', 'length'); assert.equal(dimensionZero.value, 0); assert.equal(Object.is(dimensionZero.value, -0), false);
});

test('C03 division rejects signed, computed and typed zero at the division token', () => {
  for (const [source, offset, token, kind] of [['1/0', 1, '/', 'scalar'], ['1 ÷ -0', 2, '÷', 'scalar'],
    ['width / (2-2)', 6, '/', 'length'], ['width/0mm', 5, '/', 'scalar']] as const) error(source, 'DivisionByZeroError', offset, token, kind);
  error('2/zero', 'DivisionByZeroError', 1, '/', 'scalar', 'mm', { zero: { value: -0, kind: 'scalar' } });
});

test('C03 overflowing literals, suffix conversion and intermediate arithmetic are rejected', () => {
  error('1e309', 'NonFiniteValueError', 0, '1e309');
  error('-1E309', 'NonFiniteValueError', 1, '1E309');
  error('1e308 inch', 'NonFiniteValueError', 6, 'inch', 'length');
  error('1e308*2', 'NonFiniteValueError', 5, '*');
  error('1e308+1e308', 'NonFiniteValueError', 5, '+');
  error('1e308/1e-308', 'NonFiniteValueError', 5, '/');
  error('1e308 * 2 / 2', 'NonFiniteValueError', 6, '*');
});

test('C03 final implicit conversion overflow identifies the root or sole literal', () => {
  error('1e308', 'NonFiniteValueError', 0, '1e308', 'length', 'inch');
  error('1e308/1', 'NonFiniteValueError', 5, '/', 'length', 'inch');
  error('-1e308', 'NonFiniteValueError', 0, '-', 'length', 'inch');
});

test('C03 large finite degree conversion does not overflow an avoidable intermediate', () => {
  const result = evaluate('1e308deg', 'angle');
  assert.equal(Number.isFinite(result.value), true); near(result.value, 1.7453292519943295e306);
  assert.equal(result.kind, 'angle'); assert.deepEqual(result.dependencies, []);
});

test('C03 nonfinite referenced variable values identify the name', () => {
  for (const value of [NaN, Infinity, -Infinity]) error('2 * bad', 'NonFiniteValueError', 4, 'bad', 'scalar', 'mm', { bad: { value, kind: 'scalar' } });
});

test('C03 EOF reports the untrimmed source length and an empty token', () => {
  for (const source of ['', ' \t', '1 + ', '(', '(1+2', '(1 + 2) +\n', '(-']) error(source, 'ExpressionSyntaxError', source.length, '');
});

test('C03 rejects invalid syntax, implicit multiplication and suffixes on groups', () => {
  for (const [source, offset, token] of [['1 + )', 4, ')'], ['1)', 1, ')'], ['()', 1, ')'], ['1 2', 2, '2'], ['2(3)', 1, '('],
    ['(2)mm', 3, 'mm'], ['1,5', 1, ','], ['2^3', 1, '^'], ['2%3', 1, '%'], ['2**3', 2, '*'], ['[1]', 0, '['], ['{a:1}', 0, '{'],
    ['s=10', 1, '='], ['s.x', 1, '.'], ['s(1)', 1, '(']] as const) error(source, 'ExpressionSyntaxError', offset, token);
});

test('C03 malformed numeric exponents and case-sensitive/unknown suffixes are rejected', () => {
  for (const source of ['1e+', '1e-', '1E', '1.2.3', '1MM', '1cm', '1DEG']) {
    assert.throws(() => evaluate(source, 'length'), { name: 'ExpressionSyntaxError' });
  }
});

test('C03 rejected statement text cannot execute host code', () => {
  const host = globalThis as unknown as Record<string, unknown>, marker = '__c03ExpressionSentinel';
  assert.equal(Object.hasOwn(host, marker), false); host[marker] = 0;
  try {
    error(`1; globalThis.${marker}=99`, 'ExpressionSyntaxError', 1, ';');
    assert.equal(host[marker], 0);
  } finally { delete host[marker]; }
});

test('C03 frozen requests are unchanged and result dependency arrays are independent', () => {
  const request: DimensionRequest = Object.freeze({ expression: Object.freeze({ source: 'width/2', kind: 'length' as const }),
    context: Object.freeze({ units: 'inch' as const, variables: Object.freeze({ width: Object.freeze({ value: 40, kind: 'length' as const }) }) }) });
  const before = JSON.stringify(request), first = evaluateDimension(request); first.dependencies.push('poison');
  assert.deepEqual(evaluateDimension(request), { value: 20, kind: 'length', dependencies: ['width'] }); assert.equal(JSON.stringify(request), before);
});

test('C03 deterministic bounded integer arithmetic obeys distributivity and parentheses', () => {
  for (let a = -40; a <= 40; a++) {
    const b = (a * 7) % 19, c = ((a + 53) % 9) + 1;
    const source = `(${a}+${b})*${c}`, expected = { value: (a + b) * c || 0, kind: 'scalar', dependencies: [] };
    assert.deepEqual(evaluate(source), expected); assert.deepEqual(evaluate(source), evaluate(`(${a})*${c}+(${b})*${c}`));
    assert.deepEqual(evaluate(source), evaluate(` (( ${source} )) `));
  }
});

test('C03 canonical variable evaluation and explicit units are invariant across document units', () => {
  for (let value = -30; value <= 30; value++) {
    const names: Variables = { left: { value, kind: 'length' }, right: { value: 7, kind: 'length' }, scale: { value: 2, kind: 'scalar' } };
    for (const source of ['(left+right)-right', 'left/scale', '0*right+left']) {
      assert.deepEqual(evaluate(source, 'length', 'mm', names), evaluate(source, 'length', 'inch', names));
    }
    assert.deepEqual(evaluate(`${value}in`, 'length', 'mm'), evaluate(`${value}in`, 'length', 'inch'));
  }
});

test('C03 dependency sets survive reordering, duplicates and cancellation', () => {
  const expected = ['gap', 'height', 'width'];
  for (const source of ['width+height+gap', 'gap+width+height', 'height+gap+width+width-width', '0*gap+width+height']) {
    assert.deepEqual(evaluate(source, 'length').dependencies, expected);
  }
});

test('C03 deep parentheses and unary chains do not consume the host call stack', () => {
  const depth = 20_000;
  assert.deepEqual(evaluate('('.repeat(depth) + '1' + ')'.repeat(depth)), { value: 1, kind: 'scalar', dependencies: [] });
  assert.equal(evaluate('-'.repeat(depth) + '1').value, 1); assert.equal(evaluate('-'.repeat(depth + 1) + '1').value, -1);
  const unclosed = '('.repeat(depth) + '1'; error(unclosed, 'ExpressionSyntaxError', unclosed.length, '');
  assert.equal(evaluate('1+'.repeat(5_000) + '1').value, 5_001);
});
