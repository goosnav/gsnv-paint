import { defineConfig } from 'vite';

// D04: development and local production responses carry the same isolation policy.
const headers = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export default defineConfig({
  // LibRaw-WASM resolves its worker and .wasm relative to its own module; pre-bundling would break those URLs.
  optimizeDeps: { exclude: ['libraw-wasm'] },
  server: { strictPort: true, headers },
  // The local launcher serves dist/ with these settings. Loopback only, no cross-origin access.
  preview: { host: '127.0.0.1', strictPort: true, cors: false, headers },
});
