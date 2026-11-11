/**
 * PURPOSE    Evaluate typed CAD dimension arithmetic in canonical units.
 * KIND       CORE
 * CONTRACT   IN: DimensionRequest; typed field kind, document mm/inch units and a plain
 *            own-property variable record whose values are canonical mm/radians/scalars.
 *            Grammar: decimal/scientific literals (including .5 and 1.), case-sensitive
 *            ASCII identifiers [A-Za-z_][A-Za-z0-9_]*, parentheses, unary +/-, binary
 *            + - * / (also − × ÷); normal precedence, binary operators left-associative.
 *            A numeric literal may have mm, inch, in, deg, rad or ° suffix, with optional
 *            JavaScript whitespace; suffixes are case-sensitive and reserved as variable names.
 *            Bare-only arithmetic remains implicit scalar. In addition/subtraction with
 *            a dimension, or at the final field boundary, it adopts document length
 *            units or degrees for angles. Example: width/2 scales width; width+2 adds
 *            2 document units. Bare 10/2 in a length field is 5 document units.
 *            Explicit scalar variables/ratios never implicitly become dimensions; scalar
 *            arithmetic remains implicit only when both operands were implicit.
 *            Addition/subtraction needs like kinds after implicit promotion. Multiply
 *            needs at least one scalar; division by a scalar preserves kind, and like
 *            dimensional division yields explicit scalar. Compound dimensions are rejected.
 *            OUT: EvaluatedValue; finite canonical value, requested kind, +0 for either
 *            signed zero, and unique lexically sorted referenced names (even zero-weight).
 *            RAISES: ExpressionSyntaxError for invalid grammar; UnknownVariableError for
 *            missing own names; UnitMismatchError at incompatible operator/final result;
 *            DivisionByZeroError at /; NonFiniteValueError at overflowing literal/unit,
 *            referenced variable, operation or final implicit conversion. Errors have
 *            zero-based UTF-16 offset and original token; EOF uses source.length and ''.
 *            Suffix conversion errors identify the suffix; final kind/conversion errors
 *            identify the root operator or sole numeric/identifier operand.
 * GUARANTEES Deterministic, no I/O, host evaluation, functions, mutation or prototype lookup.
 *            Explicit units and canonical variable values are independent of document units.
 * TUNING     No tolerance or resource cutoff; unit factors are fixed definitions.
 * DECISIONS  D1: Parse only the requested arithmetic. Alternative: host evaluation or a
 *            general math language. Why not: extra functions/types exceed scope and expose
 *            executable input. Revisit if: the owner adds a richer expression grammar.
 *            D2: Preserve implicit literals until context supplies units. Alternative:
 *            assign all numbers length immediately, which breaks width/2. Explicit
 *            scalars stay typed to catch unit mistakes. Revisit if: field semantics change.
 *            D3: Use iterative operator/value stacks. Alternative: recursive descent,
 *            which lets deeply nested user input exhaust the call stack. Revisit if:
 *            a changed grammar needs a persistent syntax tree for editing.
 * LIMITS     IEEE-754 arithmetic; no functions, assignments, implicit multiplication,
 *            locale decimal commas, compound units, or suffixes on parenthesized values.
 *            Variable resolution/cycles and feature-positive ranges belong to callers.
 * TESTBENCH  src/cad/dimension-expressions.test.ts -- run with: node --import tsx --test src/cad/dimension-expressions.test.ts
 */
type DimensionKind = 'length' | 'angle' | 'scalar';
export type DimensionRequest = Readonly<{
  expression: Readonly<{ source: string; kind: DimensionKind }>;
  context: Readonly<{ units: 'mm' | 'inch'; variables: Readonly<Record<string, Readonly<{ value: number; kind: DimensionKind }>>> }>;
}>;
export type EvaluatedValue = { value: number; kind: DimensionKind; dependencies: string[] };

type Token = { text: string; offset: number };
type Quantity = { value: number; kind: DimensionKind; implicit: boolean; token: Token };
type Operator = { code: string; unary: boolean; token: Token };
const INCH_TO_MM = 25.4; // Exact international-inch definition.
const DEG_TO_RAD = Math.PI / 180; // Predivide to avoid overflowing otherwise finite large angles.
const UNITS: Readonly<Record<string, { kind: DimensionKind; scale: number }>> = Object.freeze({
  mm: { kind: 'length', scale: 1 }, inch: { kind: 'length', scale: INCH_TO_MM }, in: { kind: 'length', scale: INCH_TO_MM },
  deg: { kind: 'angle', scale: DEG_TO_RAD }, rad: { kind: 'angle', scale: 1 }, '°': { kind: 'angle', scale: DEG_TO_RAD },
});

function fail(name: string, message: string, token: Token): never {
  const place = token.text ? JSON.stringify(token.text) : 'end of expression';
  throw Object.assign(new Error(`${message} at character ${token.offset + 1} (${place}).`), { name, offset: token.offset, token: token.text });
}
function finite(value: number, token: Token): number {
  if (!Number.isFinite(value)) fail('NonFiniteValueError', 'The value exceeds finite numeric range', token);
  return value;
}
function tokenize(source: string): Token[] {
  const pattern = /\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/−×÷°]/gy;
  const tokens: Token[] = [];
  for (let offset = 0; offset < source.length;) {
    pattern.lastIndex = offset;
    const match = pattern.exec(source);
    if (!match) fail('ExpressionSyntaxError', 'Unsupported expression character', { offset, text: String.fromCodePoint(source.codePointAt(offset)!) });
    if (match[0].trim()) tokens.push({ text: match[0], offset });
    offset = pattern.lastIndex;
  }
  return tokens;
}
function priority(operator: Operator): number { return operator.unary ? 3 : ['*', '/'].includes(operator.code) ? 2 : 1; }

export function evaluateDimension({ expression, context }: DimensionRequest): EvaluatedValue {
  const tokens = tokenize(expression.source), values: Quantity[] = [], operators: Operator[] = [], dependencies = new Set<string>();
  const eof = { text: '', offset: expression.source.length };
  let expectingOperand = true;
  const promote = (quantity: Quantity, kind: DimensionKind, at: Token): Quantity => {
    if (!quantity.implicit || kind === 'scalar') return quantity;
    const scale = kind === 'angle' ? DEG_TO_RAD : context.units === 'inch' ? INCH_TO_MM : 1;
    return { ...quantity, value: finite(quantity.value * scale, at), kind, implicit: false };
  };
  const reduce = () => {
    const operator = operators.pop()!, right = values.pop()!;
    if (operator.unary) {
      values.push({ ...right, value: finite(operator.code === '-' ? -right.value : right.value, operator.token), token: operator.token });
      return;
    }
    let left = values.pop()!, rhs = right, kind: DimensionKind, value: number;
    if (operator.code === '+' || operator.code === '-') {
      if (left.kind !== rhs.kind) {
        left = promote(left, rhs.kind, operator.token); rhs = promote(rhs, left.kind, operator.token);
      }
      if (left.kind !== rhs.kind) fail('UnitMismatchError', `Cannot combine ${left.kind} and ${rhs.kind}`, operator.token);
      kind = left.kind; value = operator.code === '+' ? left.value + rhs.value : left.value - rhs.value;
    } else if (operator.code === '*') {
      if (left.kind !== 'scalar' && rhs.kind !== 'scalar') fail('UnitMismatchError', 'Multiplication requires a scalar factor', operator.token);
      kind = left.kind === 'scalar' ? rhs.kind : left.kind; value = left.value * rhs.value;
    } else {
      if (rhs.value === 0) fail('DivisionByZeroError', 'Cannot divide by zero', operator.token);
      if (rhs.kind === 'scalar') kind = left.kind;
      else if (left.kind === rhs.kind) kind = 'scalar';
      else fail('UnitMismatchError', `Cannot divide ${left.kind} by ${rhs.kind}`, operator.token);
      value = left.value / rhs.value;
    }
    values.push({ value: finite(value, operator.token), kind, implicit: left.implicit && rhs.implicit, token: operator.token });
  };
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!, code = token.text.replace('−', '-').replace('×', '*').replace('÷', '/');
    if (expectingOperand) {
      if (code === '+' || code === '-' || code === '(') {
        operators.push({ code, unary: code !== '(', token }); continue;
      }
      if (/^[\d.]/.test(token.text)) {
        let value = finite(Number(token.text), token), kind: DimensionKind = 'scalar', implicit = true;
        const suffix = tokens[index + 1];
        if (suffix && Object.hasOwn(UNITS, suffix.text)) {
          const unit = UNITS[suffix.text]!;
          value = finite(value * unit.scale, suffix); kind = unit.kind; implicit = false; index++;
        }
        values.push({ value, kind, implicit, token });
      } else if (/^[A-Za-z_]/.test(token.text) && !Object.hasOwn(UNITS, token.text)) {
        if (!Object.hasOwn(context.variables, token.text)) fail('UnknownVariableError', `Unknown variable ${JSON.stringify(token.text)}`, token);
        const variable = context.variables[token.text]!;
        dependencies.add(token.text);
        values.push({ value: finite(variable.value, token), kind: variable.kind, implicit: false, token });
      } else fail('ExpressionSyntaxError', 'Expected a number, variable or opening parenthesis', token);
      expectingOperand = false;
    } else if (code === ')') {
      while (operators.length && operators.at(-1)!.code !== '(') reduce();
      if (!operators.length) fail('ExpressionSyntaxError', 'Unmatched closing parenthesis', token);
      operators.pop();
    } else if (['+', '-', '*', '/'].includes(code)) {
      const next = { code, unary: false, token };
      while (operators.length && operators.at(-1)!.code !== '(' && priority(operators.at(-1)!) >= priority(next)) reduce();
      operators.push(next); expectingOperand = true;
    } else fail('ExpressionSyntaxError', 'Expected an operator or closing parenthesis', token);
  }
  if (expectingOperand) fail('ExpressionSyntaxError', 'Expected an operand', eof);
  while (operators.length) {
    if (operators.at(-1)!.code === '(') fail('ExpressionSyntaxError', 'Missing closing parenthesis', eof);
    reduce();
  }
  const result = promote(values[0]!, expression.kind, values[0]!.token);
  if (result.kind !== expression.kind) fail('UnitMismatchError', `Expected ${expression.kind}, received ${result.kind}`, result.token);
  return { value: result.value === 0 ? 0 : result.value, kind: result.kind, dependencies: [...dependencies].sort() };
}
