/**
 * PURPOSE    Render the Image Layers panel (top layer first) and report layer actions.
 * KIND       SHELL
 * CONTRACT   IN: root and onAction callback. update({layers,activeLayerId,thumbnails,enabled}) where layers are
 *            bottom→top metadata and thumbnails are small canvases keyed by layer id.
 *            OUT: {update,dispose}. Actions: select/visibility/rename (double-click name) per row; new, duplicate,
 *            delete, up, down, merge down buttons; opacity trackbar + number box (preview on drag, commit on
 *            release/Enter); blend mode select.
 *            RAISES: TypeError for a missing root/callback.
 * GUARANTEES No document edits; supplied names are rendered as text. Listeners removed on dispose.
 * TUNING     None.
 * DECISIONS  D1: Top-first list like Photoshop/GIMP, while the document stores bottom→top.
 * LIMITS     No drag-and-drop reordering, groups or masks.
 * TESTBENCH  src/image/image-layers-panel.test.ts -- run with: node --import tsx --test src/image/image-layers-panel.test.ts
 */
import { BLEND_MODES, type BlendMode } from './image-composite.ts';
import type { LayerMeta } from './image-content.ts';

export type LayerAction =
  | { id: 'select' | 'toggle' | 'rename'; layerId: string }
  | { id: 'new' | 'duplicate' | 'delete' | 'up' | 'down' | 'mergeDown' }
  | { id: 'opacity'; value: number; commit: boolean } | { id: 'blend'; value: BlendMode };
export type LayersModel = { layers: readonly LayerMeta[]; activeLayerId: string; thumbnails: ReadonlyMap<string, HTMLCanvasElement>; enabled: boolean };
const BLEND_LABELS: Record<BlendMode, string> = { normal: 'Normal', multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay', darken: 'Darken', lighten: 'Lighten', difference: 'Difference' };

export function imageLayersPanel({ root, onAction }: { root: HTMLElement; onAction: (action: LayerAction) => void }) {
  if (!root?.ownerDocument || typeof onAction !== 'function') throw new TypeError('The layers panel needs a root and callback.');
  const document = root.ownerDocument;
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => { const n = document.createElement(tag); if (className) n.className = className; if (text) n.textContent = text; return n; };
  root.className = 'image-layers'; root.replaceChildren();
  const blendRow = make('div', 'image-layer-row'), blendLabel = make('label', '', 'Mode'), blend = make('select', 'xp-field');
  blend.id = 'image-layer-blend'; blendLabel.htmlFor = blend.id; blend.dataset.layerControl = 'blend';
  for (const mode of BLEND_MODES) { const o = make('option', '', BLEND_LABELS[mode]); o.value = mode; blend.append(o); }
  blendRow.append(blendLabel, blend);
  const opacityRow = make('div', 'image-layer-row'), opacityLabel = make('label', '', 'Opacity'), opacity = make('input', 'xp-range'), opacityBox = make('input', 'xp-field');
  opacity.type = 'range'; opacityBox.type = 'number'; for (const n of [opacity, opacityBox]) { n.min = '0'; n.max = '100'; n.step = '1'; n.dataset.layerControl = 'opacity'; }
  opacity.id = 'image-layer-opacity'; opacityLabel.htmlFor = opacity.id; opacityBox.setAttribute('aria-label', 'Layer opacity (%)');
  opacityRow.append(opacityLabel, opacity, opacityBox);
  const list = make('ol', 'image-layer-list'); list.setAttribute('aria-label', 'Layers, top first');
  const buttons = make('div', 'image-layer-buttons');
  for (const [id, label, title] of [['new', 'New', 'New layer'], ['duplicate', 'Duplicate', 'Duplicate layer'], ['delete', 'Delete', 'Delete layer'], ['up', '▲', 'Move layer up'], ['down', '▼', 'Move layer down'], ['mergeDown', 'Merge', 'Merge down']] as const) {
    const b = make('button', 'xp-button', label); b.type = 'button'; b.dataset.layerAction = id; b.title = title; b.setAttribute('aria-label', title); buttons.append(b);
  }
  root.append(blendRow, opacityRow, list, buttons);
  let model: LayersModel | null = null;
  const click = (event: Event) => {
    if (!model?.enabled) return;
    const target = event.target as HTMLElement, button = target.closest<HTMLElement>('[data-layer-action]'), row = target.closest<HTMLElement>('[data-layer-id]');
    if (button) { onAction({ id: button.dataset.layerAction as 'new' }); return; }
    if (!row) return;
    if (target.closest('[data-visibility]')) onAction({ id: 'toggle', layerId: row.dataset.layerId! });
    else if (event.type === 'dblclick' && target.closest('.image-layer-name')) onAction({ id: 'rename', layerId: row.dataset.layerId! });
    else if (event.type === 'click') onAction({ id: 'select', layerId: row.dataset.layerId! });
  };
  const input = (event: Event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement; if (!model?.enabled) return;
    if (target === blend) { if (event.type === 'change') onAction({ id: 'blend', value: blend.value as BlendMode }); return; }
    if (target.dataset.layerControl !== 'opacity') return;
    if (target === opacityBox && event.type === 'input') return;
    const value = Math.round(Number(target.value)); if (!Number.isFinite(value) || target.value === '') return;
    onAction({ id: 'opacity', value: Math.min(100, Math.max(0, value)) / 100, commit: event.type === 'change' });
  };
  const key = (event: KeyboardEvent) => { const row = (event.target as HTMLElement).closest<HTMLElement>('[data-layer-id]'); if (row && (event.key === 'Enter' || event.key === ' ') && event.target === row) { event.preventDefault(); onAction({ id: 'select', layerId: row.dataset.layerId! }); } };
  root.addEventListener('click', click); root.addEventListener('dblclick', click); root.addEventListener('input', input); root.addEventListener('change', input); root.addEventListener('keydown', key);
  return {
    update(next: LayersModel) {
      model = next; list.replaceChildren();
      const active = next.layers.find(l => l.id === next.activeLayerId);
      for (const layer of [...next.layers].reverse()) {
        const row = make('li', 'image-layer'); row.dataset.layerId = layer.id; row.tabIndex = 0; row.setAttribute('aria-selected', String(layer.id === next.activeLayerId));
        const eye = make('button', 'image-layer-eye'); eye.type = 'button'; eye.dataset.visibility = ''; eye.setAttribute('aria-pressed', String(layer.visible)); eye.setAttribute('aria-label', `${layer.visible ? 'Hide' : 'Show'} ${layer.name}`); eye.title = eye.getAttribute('aria-label')!;
        const thumb = next.thumbnails.get(layer.id), name = make('span', 'image-layer-name', layer.name); name.title = 'Double-click to rename';
        const detail = make('span', 'image-layer-detail', `${Math.round(layer.opacity * 100)}%${layer.blend === 'normal' ? '' : ` · ${BLEND_LABELS[layer.blend]}`}`);
        row.append(eye, thumb ?? make('span', 'image-layer-thumb'), name, detail); list.append(row);
      }
      if (active) { if (document.activeElement !== blend) blend.value = active.blend; for (const n of [opacity, opacityBox]) if (document.activeElement !== n) n.value = String(Math.round(active.opacity * 100)); }
      const index = next.layers.findIndex(l => l.id === next.activeLayerId), disabled: Record<string, boolean> = { delete: next.layers.length < 2, up: index >= next.layers.length - 1, down: index <= 0, mergeDown: index <= 0 };
      for (const control of root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button,input,select')) control.disabled = !next.enabled || !!disabled[(control as HTMLElement).dataset.layerAction ?? ''];
    },
    dispose() { root.removeEventListener('click', click); root.removeEventListener('dblclick', click); root.removeEventListener('input', input); root.removeEventListener('change', input); root.removeEventListener('keydown', key); root.replaceChildren(); },
  };
}
