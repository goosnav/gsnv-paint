import { showDialog } from './dialog.ts';

const root = document.querySelector<HTMLElement>('#app')!;
const preview = document.querySelector<HTMLElement>('#preview')!;
const receipt = document.querySelector<HTMLElement>('#receipt')!;
let saved = { name: 'Plate', width: 40, visible: true, mode: 'fill' };
let commits = 0; let cancels = 0;
const render = (value: typeof saved) => {
  preview.textContent = `${value.name} · ${value.width} mm · ${value.mode} · ${value.visible ? 'visible' : 'hidden'}`;
  preview.style.width = `${Math.max(value.width, 1) * 4}px`; preview.style.opacity = value.visible ? '1' : '.35';
  preview.style.background = value.mode === 'fill' ? '#90b9ef' : 'transparent';
};
render(saved);
document.querySelector('#edit')!.addEventListener('click', () => {
  showDialog({ root, spec: {
    title: 'Rectangle properties', fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'width', label: 'Width (mm)', type: 'number', min: 1, max: 100 },
      { key: 'visible', label: 'Visible', type: 'checkbox' },
      { key: 'mode', label: 'Display', type: 'select', choices: [{ value: 'fill', label: 'Fill' }, { value: 'outline', label: 'Outline' }] },
    ], initial: saved,
    validate: values => String(values.name).trim() ? { ok: true, value: { ...values, name: String(values.name).trim() } } : { ok: false, error: { code: 'name.empty', message: 'Enter a name.' } },
    preview: value => render(value as typeof saved),
    commit: value => { saved = value as typeof saved; render(saved); commits++; receipt.textContent = `Committed ${commits}; cancelled ${cancels}`; },
    cancel: () => { render(saved); cancels++; receipt.textContent = `Committed ${commits}; cancelled ${cancels}`; },
  } });
});
