import { keymap, type CommandEvent } from './keymap.ts';

const event: CommandEvent = { key: ' ', ctrl: false, meta: false, shift: false, alt: false, target: 'view', workspace: 'video', viewRole: 'timeline' };
console.log('Space in the timeline:', keymap(event));
console.log('Space in the preview:', keymap({ ...event, viewRole: 'preview2d' }));
console.log('Space in a text field:', keymap({ ...event, target: 'text' }));
