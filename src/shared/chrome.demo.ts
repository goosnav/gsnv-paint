import { createChrome, type ChromeModel } from './chrome.ts';

const panel = (id: string, title: string, text: string) => {
  const content = document.createElement('p'); content.className = 'fixture-panel-copy'; content.textContent = text;
  return { id, title, content };
};
const panels = {
  cad: [panel('document', 'Document', 'No document open.'), panel('history', 'History', 'Document edits will appear here.')],
  image: [panel('layers', 'Layers', 'No image document open.'), panel('history', 'History', 'Document edits will appear here.')],
  photo: [panel('develop', 'Develop', 'No photo open.'), panel('history', 'History', 'Document edits will appear here.')],
  document: [panel('format', 'Format', 'No document open.')], slides: [panel('slide', 'Slide', 'No deck open.')], audio: [panel('audio', 'Audio', 'No audio open.')],
  spreadsheet: [panel('cells', 'Cells', 'No workbook open.')], code: [panel('files', 'Files', 'No code project open.')],
  video: [panel('media', 'Media', 'No Video project open.'), panel('properties', 'Properties', 'Nothing selected.')],
};
let model: ChromeModel = {
  title: 'Untitled', workspace: 'cad', dirty: false,
  menus: [{ id: 'file', label: 'File', items: [
    { id: 'file.new', label: 'New', shortcut: 'Ctrl+N', icon: 'new', enabled: false, toolbar: true },
    { id: 'file.open', label: 'Open', shortcut: 'Ctrl+O', icon: 'open', enabled: true, toolbar: true },
    { id: 'file.save', label: 'Save', shortcut: 'Ctrl+S', icon: 'save', enabled: false, toolbar: true },
  ] }, { id: 'edit', label: 'Edit', items: [
    { id: 'edit.undo', label: 'Undo', shortcut: 'Ctrl+Z', icon: 'undo', enabled: false, toolbar: true },
    { id: 'edit.redo', label: 'Redo', shortcut: 'Ctrl+Y', icon: 'redo', enabled: false, toolbar: true },
  ] }, { id: 'view', label: 'View', items: [{ id: 'view.fit', label: 'Fit view', shortcut: 'F', icon: 'fit', enabled: true }] }],
  tools: [
    { id: 'tool.select', label: 'Select', shortcut: 'Esc', icon: 'select', enabled: true, status: 'Click an item to select it.' },
    { id: 'view.panHold', label: 'Hand', shortcut: 'Space', icon: 'hand', enabled: true, status: 'Drag to pan the view.' },
    { id: 'view.zoom', label: 'Zoom', shortcut: 'Wheel', icon: 'zoomIn', enabled: true, status: 'Use the wheel to zoom at the cursor.' },
    { id: 'view.fit', label: 'Fit view', shortcut: 'F', icon: 'fit', enabled: true, status: 'Fit the document to the view.' },
  ],
  panels: panels.cad, status: 'Window shell demonstration. Choose a workspace.',
  capabilities: [{ id: 'fixture', label: 'Development fixture', status: 'unavailable', message: 'This page demonstrates UI routing. Workspace editing is not connected.' }],
};
const chrome = createChrome({ root: document.querySelector<HTMLElement>('#app')!, model,
  onCommand: id => { model = { ...model, status: `Command received: ${id}.` }; chrome.update(model); },
  onWorkspace: workspace => { model = { ...model, workspace, panels: panels[workspace], status: `${workspace === 'cad' ? 'CAD' : workspace === 'image' ? 'Image' : workspace === 'photo' ? 'Photo' : workspace === 'video' ? 'Video' : workspace === 'document' ? 'Document' : workspace === 'slides' ? 'Slides' : 'Audio'} workspace selected.` }; chrome.update(model); },
});
const notice = document.createElement('div'); notice.className = 'fixture-viewport-notice';
const heading = document.createElement('strong'); heading.textContent = 'Shared window shell';
const detail = document.createElement('p'); detail.textContent = 'Development fixture · controls emit callbacks. Editing is not connected.';
notice.append(heading, detail); chrome.viewport.append(notice);
