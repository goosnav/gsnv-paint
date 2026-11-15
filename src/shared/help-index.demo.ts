import { searchHelp } from './help-index.ts';
console.log(searchHelp({ query: 'custom font', workspace: 'image', commands: [{ id: 'image.text', label: 'Text', workspace: 'image', path: ['Tool palette'], shortcut: 'T', enabled: true, showMe: true }] }));
