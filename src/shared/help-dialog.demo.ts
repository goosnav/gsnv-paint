import { showHelp } from './help-dialog.ts';
import './dialog.css';
import './help.css';
const root = document.querySelector<HTMLElement>('#app');
if (root) {
  const opener = document.createElement('button'); opener.textContent = 'Open Help'; root.append(opener);
  opener.onclick = () => { showHelp({ document, root, workspace: 'image', section: 'search', commands: [
    { id: 'image.text', label: 'Text', workspace: 'image', path: ['Tool palette'], shortcut: 'T', enabled: true, showMe: true },
  ], onCommand: id => { opener.textContent = `Selected ${id}`; } }); };
}
