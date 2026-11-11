// Development-only integration data. This is not a CAD, Image or Video schema/editor.
import { mountApp, type AppDocument, type WorkspaceAdapter } from './app-shell.ts';

const MARKER = 'gsnv-paint/a-shell-integration/v1';
const names = { cad: 'CAD', image: 'Image', video: 'Video' } as const;
type Workspace = keyof typeof names;
type FixtureValue = { readonly fixture: typeof MARKER; readonly width: 1; readonly height: 1; readonly value: number; readonly rgba: readonly number[] };
type Snapshot = Parameters<ReturnType<WorkspaceAdapter['mount']>['render']>[0];
type FixtureHandle = Pick<ReturnType<typeof mountApp>, 'ready' | 'idle' | 'snapshot'>;
declare global { interface Window { __appShellFixture?: FixtureHandle } }

function fixtureValue(input: unknown): FixtureValue {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('This development fixture requires a marked one-pixel record.');
  const record = input as Record<string, unknown>;
  const rgba = record.rgba;
  if (Object.keys(record).length !== 5 || record.fixture !== MARKER || record.width !== 1 || record.height !== 1 ||
      typeof record.value !== 'number' || !Number.isInteger(record.value) || record.value < 0 || record.value > 255 ||
      !Array.isArray(rgba) || rgba.length !== 4 || !rgba.every(channel => Number.isInteger(channel) && channel >= 0 && channel <= 255) ||
      rgba[0] !== record.value || rgba[1] !== 90 || rgba[2] !== 160 || rgba[3] !== 255) throw new TypeError('Unsupported integration fixture data; no production workspace codec is installed here.');
  return Object.freeze({ fixture: MARKER, width: 1, height: 1, value: record.value, rgba: Object.freeze([...rgba]) });
}
function changed(value: number): FixtureValue {
  return fixtureValue({ fixture: MARKER, width: 1, height: 1, value, rgba: [value, 90, 160, 255] });
}
function adapter(workspace: Workspace): WorkspaceAdapter {
  const format = `gsnv-${workspace}` as const;
  const check = (documentValue: AppDocument): FixtureValue => {
    if (documentValue.format !== format || documentValue.version !== 1 || !documentValue.id || typeof documentValue.title !== 'string') throw new TypeError(`This fixture expects a version 1 ${format} envelope.`);
    return fixtureValue(documentValue.value);
  };
  return {
    create: () => Object.freeze({ id: crypto.randomUUID(), title: `${names[workspace]} integration fixture`, format, version: 1, value: changed(40) }),
    decode(packageValue) {
      const documentValue = { id: packageValue.project.id, title: packageValue.project.title, format: packageValue.project.format, version: packageValue.project.version, value: packageValue.project.content };
      const value = check(documentValue); const asset = packageValue.assets[0];
      if (packageValue.assets.length !== 1 || !asset || asset.id !== 'fixture-pixel' || asset.mime !== 'application/octet-stream' ||
          asset.bytes.length !== 4 || asset.bytes.some((channel, index) => channel !== value.rgba[index])) throw new TypeError('The integration fixture pixel asset does not match its metadata.');
      return Object.freeze({ ...documentValue, value });
    },
    encode(documentValue) {
      const value = check(documentValue);
      return { project: { format, version: 1, id: documentValue.id, title: documentValue.title,
        content: { fixture: MARKER, width: 1, height: 1, value: value.value, rgba: [...value.rgba] } },
      assets: [{ id: 'fixture-pixel', mime: 'application/octet-stream', bytes: new Uint8Array(value.rgba) }] };
    },
    mount(host) {
      const document = host.root.ownerDocument;
      const stage = document.createElement('section'); stage.className = 'fixture-stage'; stage.dataset.fixtureView = workspace;
      const heading = document.createElement('h2'); heading.textContent = `${names[workspace]} integration fixture`;
      const explanation = document.createElement('p'); explanation.textContent = 'One literal pixel and one numeric value. No workspace editor is connected.';
      const sample = document.createElement('canvas'); sample.width = 1; sample.height = 1; sample.className = 'fixture-pixel'; sample.dataset.targetId = 'fixture-pixel';
      sample.setAttribute('aria-label', 'One-pixel integration sample');
      const reading = document.createElement('p'); reading.append(document.createTextNode('Value: '));
      const output = document.createElement('output'); output.dataset.fixtureValue = workspace; reading.append(output);
      const empty = document.createElement('p'); empty.className = 'fixture-empty'; empty.textContent = 'No integration fixture document open. Use New to create test data.';
      stage.append(heading, explanation, sample, reading, empty); host.root.append(stage);
      const panel = document.createElement('div'); panel.className = 'fixture-panel';
      const details = document.createElement('p'); const context = document.createElement('p'); context.textContent = 'Context target: none'; panel.append(details, context);
      let current: Snapshot; let disposed = false;
      const draw = (value: FixtureValue | undefined) => {
        sample.hidden = !value; reading.hidden = !value; empty.hidden = Boolean(value);
        output.textContent = value ? String(value.value) : '';
        details.textContent = value ? `Explicit development marker. Dimensions: 1 × 1. RGBA: ${value.rgba.join(', ')}.` : 'No fixture data loaded.';
        const pixels = sample.getContext('2d');
        if (pixels && value) { const image = pixels.createImageData(1, 1); image.data.set(value.rgba); pixels.putImageData(image, 0, 0); }
      };
      draw(undefined);
      return {
        render(documentValue, view) {
          if (disposed) return;
          current = documentValue;
          draw(documentValue ? check(documentValue) : undefined);
          stage.dataset.zoom = String(view.zoom); stage.dataset.panX = String(view.pan.x); stage.dataset.panY = String(view.pan.y);
          stage.style.transform = `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})`;
        },
        model: () => ({ menus: [{ id: 'fixture', label: 'Development fixture', items: [{ id: 'fixture.edit', label: 'Edit fixture value', shortcut: '', icon: 'properties', toolbar: true, enabled: Boolean(current) }] }],
          tools: [], panels: [{ id: 'fixture-details', title: 'Integration fixture', content: panel }] }),
        context: () => ({ viewRole: 'preview2d', activeTool: 'fixture.inspect', status: 'Development fixture: wheel zooms; Space-drag pans; right-click identifies the sample.' }),
        command(id) {
          if (id !== 'fixture.edit' || !current || disposed) return;
          const base = current; const original = check(base);
          host.dialog({ title: 'Integration fixture value', fields: [{ key: 'value', label: 'Value', type: 'number', min: 0, max: 255, step: 1 }], initial: { value: original.value },
            validate: values => typeof values.value === 'number' && Number.isInteger(values.value) && values.value >= 0 && values.value <= 255
              ? { ok: true, value: values.value } : { ok: false, error: { code: 'fixture.value', message: 'Enter a whole value from 0 to 255.' } },
            preview: value => { if (!disposed) draw(changed(value as number)); },
            commit: value => { if (!disposed) host.commit({ id: base.id, title: base.title, format: base.format, version: base.version, value: changed(value as number) }, 'Edit integration fixture value', base.identity); },
            cancel: () => { if (!disposed) draw(current ? check(current) : undefined); },
          });
        },
        gesture: gesture => { if (!disposed && gesture.type === 'context') context.textContent = `Context target: ${gesture.targetId ?? 'empty fixture view'}`; },
        dispose() { if (disposed) return; disposed = true; stage.remove(); panel.remove(); },
      };
    },
  };
}

const root = document.querySelector<HTMLElement>('#app')!;
const app = mountApp({ root, adapters: { cad: adapter('cad'), image: adapter('image'), video: adapter('video') },
  files: { document, URL, setTimeout: (callback, milliseconds) => window.setTimeout(callback, milliseconds) },
  recovery: { indexedDB, localStorage }, probe: { environment: window, codecRequests: [] } });
window.__appShellFixture = { ready: app.ready, idle: () => app.idle(), snapshot: () => app.snapshot() };
await app.ready;
document.querySelector('#fixture-ready')!.textContent = 'Integration fixture ready';
window.addEventListener('pagehide', () => app.dispose(), { once: true });
