import { evaluateDimension } from './dimension-expressions.ts';

const context = { units: 'mm' as const, variables: { width: { value: 100, kind: 'length' as const } } };
const expression = { source: '(width - 20mm) / 2', kind: 'length' as const };
console.log('Expression:', expression.source);
console.log('Canonical result:', evaluateDimension({ expression, context }));
