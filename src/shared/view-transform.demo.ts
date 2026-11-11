import { viewTransform } from './view-transform.ts';

const range = { min: 0.01, max: 64 };
const view = { zoom: 2, pan: { x: 10, y: -5 } };
const cursor = { x: 110, y: 45 };
const zoomed = viewTransform({ view, range, action: { type: 'zoom', factor: 2, cursor } });
console.log('Zoom around cursor:', zoomed);
console.log('Document point stays at:', viewTransform({ view: zoomed, range, action: { type: 'toDocument', point: cursor } }));
