import { history } from './history.ts';
const blank = history({ op: 'create', value: { width: 100 } });
const changed = history({ op: 'commit', history: blank, label: 'Change width', value: { width: 120 } });
console.log(JSON.stringify({ changed, undo: history({ op: 'undo', history: changed }) }, null, 2));
