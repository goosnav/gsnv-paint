declare const __DEMO_BUILD__: string;
const output = document.querySelector('[role=status]')!, build = __DEMO_BUILD__;
navigator.serviceWorker.addEventListener('message', event => {
  if (event.data?.protocol === 1 && event.data.kind === 'identify' && event.ports[0]) {
    event.ports[0].postMessage({ protocol: 1, kind: 'build', requestId: event.data.requestId, build }); event.ports[0].close();
  }
  if (event.data?.kind === 'state' && event.data.build === build) render(event.data);
});
function render(data: { phase: string; error?: { message: string } }) {
  output.textContent = data.phase === 'ready' && navigator.serviceWorker.controller ? `Ready offline ${build}`
    : data.phase === 'error' ? `Offline unavailable: ${data.error?.message}` : data.phase === 'reopen-required' ? 'Reopen to enable offline' : 'Preparing offline…';
}
function status(worker?: ServiceWorker | null) {
  if (!worker) return;
  const channel = new MessageChannel();
  channel.port1.onmessage = event => { render(event.data); channel.port1.close(); };
  worker.postMessage({ protocol: 1, kind: 'status', requestId: crypto.randomUUID(), pageBuild: build }, [channel.port2]);
}
try {
  const registration = await navigator.serviceWorker.register('/offline-sw.js', { scope: '/', updateViaCache: 'none' });
  navigator.serviceWorker.addEventListener('controllerchange', () => status(navigator.serviceWorker.controller));
  status(navigator.serviceWorker.controller ?? registration.active);
  document.querySelector('button')!.addEventListener('click', () => { void registration.update().catch(error => { output.textContent = String(error); }); });
} catch (error) { output.textContent = `Offline unavailable: ${String(error)}`; }
