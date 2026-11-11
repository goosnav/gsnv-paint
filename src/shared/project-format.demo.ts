import { projectFormat } from './project-format.ts';

const text = projectFormat({ op: 'encode', project: {
  format: 'gsnv-cad', version: 1, id: 'plate', title: 'Plate metadata example',
  content: { units: 'mm', variables: { width: 100, depth: 10 } },
} });
console.log(text);
console.log(projectFormat({ op: 'decode', text }));
