import { evaluateVariables } from './named-variables.ts';

const result = evaluateVariables({ units: 'mm', variables: [
  { name: 'half', expression: { source: 'width / 2', kind: 'length' } },
  { name: 'width', expression: { source: '40', kind: 'length' } },
] });
console.log('Canonical variables:', result.context.variables);
console.log('Resolution order:', result.order);
console.log('Direct dependents:', result.dependents);
