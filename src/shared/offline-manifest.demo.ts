import { offlineManifest } from './offline-manifest.ts';
const manifest = { schema: 1, build: 'b'.repeat(64), assets: [{ url: '/index.html', bytes: 12, sha256: 'a'.repeat(64), mime: 'text/html' }] };
console.log('Validated static manifest:', offlineManifest(manifest));
try { offlineManifest({ ...manifest, assets: [{ ...manifest.assets[0], url: '/a/../index.html' }] }); }
catch (error) { console.log('Rejected unsafe path:', (error as Error).message); }
