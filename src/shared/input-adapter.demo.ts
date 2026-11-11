import { bindInput, type CommandContext, type Gesture } from './input-adapter.ts';
import { viewTransform, type View2D } from './view-transform.ts';

const root = document.querySelector<HTMLElement>('#view')!;
const shape = document.querySelector<HTMLElement>('#shape')!;
let view: View2D = { zoom: 1, pan: { x: 0, y: 0 } };
let context: CommandContext = { workspace: 'image', target: 'view', viewRole: 'canvas2d', activeTool: 'select', status: 'Inspect input' };
const gestures: Gesture[] = []; const commands: string[] = [];
const render = () => {
  shape.style.transform = `translate(${view.pan.x}px,${view.pan.y}px) scale(${view.zoom})`;
  document.querySelector('#view-state')!.textContent = JSON.stringify(view);
  document.querySelector('#gestures')!.textContent = JSON.stringify(gestures.slice(-50), null, 2);
  document.querySelector('#commands')!.textContent = JSON.stringify(commands);
};
bindInput({ root, context: () => context,
  onCommand: command => { commands.push(command); render(); },
  onGesture: gesture => {
    gestures.push(gesture);
    if (gesture.type === 'pan' || gesture.type === 'wheel') view = viewTransform({ view, range: { min: .01, max: 64 }, action: gesture.type === 'pan' ? gesture : { type: 'zoom', factor: gesture.factor, cursor: gesture.cursor } });
    render();
  },
});
document.querySelector('#reset')!.addEventListener('click', () => { gestures.length = 0; commands.length = 0; view = { zoom: 1, pan: { x: 0, y: 0 } }; render(); });
document.querySelector<HTMLSelectElement>('#context')!.addEventListener('change', event => {
  const selected = (event.target as HTMLSelectElement).value;
  context = selected === 'timeline' ? { ...context, workspace: 'video', viewRole: 'timeline' } : selected === 'cad3d' ? { ...context, workspace: 'cad', viewRole: 'cad3d' } : { ...context, workspace: 'image', viewRole: 'canvas2d' };
  root.focus();
});
render();
document.querySelector<HTMLButtonElement>('#native-button')!.addEventListener('click', event => { const button = event.currentTarget as HTMLButtonElement; button.dataset.clicks = String(Number(button.dataset.clicks) + 1); });
