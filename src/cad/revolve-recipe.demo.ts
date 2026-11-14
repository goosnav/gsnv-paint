import { revolveRecipe } from './revolve-recipe.ts';

const result = revolveRecipe({
  operation: 'profile', sketchId: 'section',
  source: {
    kind: 'revolve', operation: 'boss', sketchId: 'section', profileLoopIds: [],
    axis: { kind: 'sketch-axis', sketchId: 'section', axis: 'v' },
    angle: { source: '-quarterTurn', kind: 'angle' }, targetBodyIds: [],
  },
  context: { units: 'mm', variables: { quarterTurn: { value: Math.PI / 2, kind: 'angle' } } },
  tolerance: { linearMm: 1e-7, angularRad: 1e-9, relative: 1e-9 },
  entities: [{ id: 'section-circle', kind: 'circle', center: [20, 6], radius: 3, construction: false }],
});
console.log(JSON.stringify(result, null, 2));
console.log('Recipe only: a CAD worker must still build and validate the revolved solid.');
