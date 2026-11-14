import { defineConfig } from 'vite';
import { offlineBuild } from './dev/offline-build.ts';

// D04: development and local production responses carry the same isolation policy.
const headers = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

// Link previews need absolute URLs: set SITE_URL (for example https://paint.example.com) in the deploy build.
const siteUrl = (process.env.SITE_URL ?? '').replace(/\/$/, '');

export default defineConfig({
  plugins: [
    { name: 'site-url', transformIndexHtml: html => html.replaceAll('%SITE_URL%', siteUrl) },
    { name: 'offline-bootstrap-revalidation', configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        if (['/', '/index.html', '/offline-sw.js', '/offline-manifest.json'].includes((request.url ?? '').split('?')[0]!)) response.setHeader('Cache-Control', 'no-cache');
        next();
      });
    } },
    offlineBuild(),
  ],
  // LibRaw-WASM resolves its worker and .wasm relative to its own module; pre-bundling would break those URLs.
  optimizeDeps: { exclude: ['libraw-wasm'] },
  server: { strictPort: true, headers },
  // The local launcher serves dist/ with these settings. Loopback only, no cross-origin access.
  preview: { host: '127.0.0.1', strictPort: true, cors: false, headers },
});
