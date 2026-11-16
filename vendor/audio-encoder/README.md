# Locally bundled MP3 encoder

Pinned `@breezystack/lamejs@1.2.7` (LGPL-3.0), unmodified. npm's package contains
built code and declaration files. The exact package gitHead source and its build
scripts are shipped under `public/licenses/lamejs-1.2.7-source.zip`:

- repository: https://github.com/gideonstele/lamejs
- revision: `1fb0ef5fa177413107e2e107d054a9b994e3f79c`
- archive SHA256: `bc1b533b837e5b82f114b9721c47c9210c1106ba3f0a649058f14451befda09e`
- full LGPL/GPL texts and original notice are alongside the source archive.

The dependency stays separate in source (`audio-encode.ts` imports it normally).
To replace it, build a compatible version of that package, install it in this
repo, then `npm run build`. Vite rebuilds the locally bundled worker. No signature,
remote license check or account prevents replacing/relinking the library. Its
use and the corresponding source are disclosed in the app's third-party notices
and the Audio wizard. All app source needed to rebuild is available in this repo.
