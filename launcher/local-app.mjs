/**
 * Serve a current local entry outside old offline workers' cached root routes.
 * The production bundle is shared with Cloudflare; this preview-only plugin adds
 * local identity and disables redundant browser offline installation in that entry.
 * It never clears project storage, unregisters workers or reloads working tabs.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const PREFIX = '/__gsnv-local__/', HEX = /^[a-f0-9]{64}$/;
const HEADERS = {
  'Cache-Control': 'no-store',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
};

export function localAppPath(buildId) {
  if (!HEX.test(buildId)) throw new TypeError('The local build identity must be 64 lowercase hex characters.');
  return `${PREFIX}start/${buildId}`;
}

export function localAppPlugin({ buildId, sourceId, checkoutId, revision }) {
  const entry = localAppPath(buildId);
  if (!HEX.test(sourceId) || !HEX.test(checkoutId) || typeof revision !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(revision))
    throw new TypeError('The local source, checkout and revision identities are invalid.');
  const identity = JSON.stringify({ app: 'gsnv-paint', protocol: 1, buildId, sourceId, checkoutId, revision });
  return {
    name: 'gsnv-local-entry',
    configurePreviewServer(server) {
      const index = resolve(server.config.root, server.config.build.outDir, 'index.html');
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '').split('?')[0];
        if (!path.startsWith(PREFIX)) return next();
        const send = (status, content, mime = 'text/plain; charset=utf-8') => {
          response.writeHead(status, { ...HEADERS, 'Content-Type': mime, 'Content-Length': Buffer.byteLength(content) });
          response.end(request.method === 'HEAD' ? undefined : content);
        };
        if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::[0-9]+)?$/i.test(request.headers.host ?? '')) {
          send(403, 'Local Paint accepts loopback hosts only.'); return;
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.setHeader('Allow', 'GET, HEAD'); send(405, 'This local endpoint is read-only.'); return;
        }
        if (path === `${PREFIX}status`) {
          response.setHeader('X-GSNV-Local-Build', buildId);
          send(200, identity, 'application/json; charset=utf-8'); return;
        }
        if (path !== entry) {
          send(409, 'This local Paint build has changed. Save any open work, close the old launcher and run run.command or run.cmd again.'); return;
        }
        void readFile(index, 'utf8').then(html => {
          const actual = html.match(/<meta\s+name="gsnv-build-id"\s+content="([a-f0-9]{64})"\s*\/?\s*>/)?.[1];
          if (actual !== buildId || !/<head(?:\s[^>]*)?>/i.test(html)) {
            send(409, 'The local build changed while Paint was running. Save open work, stop the launcher and start it again.'); return;
          }
          const metadata = `<base href="/"><meta name="gsnv-local-runtime" content="1"><meta name="gsnv-local-revision" content="${revision}">`;
          // The root base keeps relative help links valid from the versioned entry URL.
          send(200, html.replace(/<head(?:\s[^>]*)?>/i, head => head + metadata), 'text/html; charset=utf-8');
        }).catch(() => send(503, 'The local application build is unavailable. Stop the launcher and start it again to rebuild.'));
      });
    },
  };
}
