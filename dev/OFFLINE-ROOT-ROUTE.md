# Offline installation through the canonical root route

Mode A amendment to S18 and its S17/S19 assembly verification, 2026-11-13.
The owner's complete-build offline requirement and static Cloudflare deployment
are unchanged. This amendment is contracted before the correction; it grants no
acceptance or passing-test status.

The actual local Wrangler 4.160.1 static server returned **307 Location: /** for
`/index.html`, with no HTML payload. Every other asset in the 55-entry candidate
manifest matched the declared MIME and isolation headers. The root route returned
200, `text/html; charset=utf-8` and `Cache-Control: no-cache`. S18 deliberately
rejects redirects, so its former direct index-file fetch could not complete an
installation on this deployment.

This is documented hosting behavior: [Workers HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)
redirects noncanonical HTML paths, and [Pages serving rules](https://developers.cloudflare.com/pages/configuration/serving-pages/)
also redirect HTML files to extensionless routes. A Vite-only server check did
not establish compatibility with either hosting shell.

## Exact correction contract

- Keep the manifest's physical output URL `/index.html`, exact SHA-256, byte
  count, MIME and required headers. Keep `/index.html` as its published cache key.
- When installing **that one entry only**, S18 fetches the same-origin canonical
  path `/`. Every other entry fetches its exact manifest URL unchanged.
- The request still omits credentials, bypasses the HTTP cache, forbids redirects
  and obeys its existing cancellation and timeout bounds. Validate the root
  response against the index entry's exact bytes, digest, MIME and headers before
  caching it. A wrong-generation root document must fail integrity validation.
- Never accept arbitrary redirect destinations, user-supplied aliases, missing
  assets, HTML fallbacks for scripts/WASM, or a partial cache generation. S19's
  existing root/index navigation lookup and range behavior are unchanged.
- Installation failures preserve the previous complete generation exactly as
  already contracted. No Worker-side logic, new dependency or deployed setting
  is needed. Pages and the local static launcher receive the same build.

Alternative: disable Workers HTML canonicalization in Wrangler. Rejected because
that changes only one hosting shell and does not establish Pages compatibility.
Alternative: follow redirects. Rejected because it broadens the fetch contract
for every asset without proving that the final URL belongs to this build.
Revisit the fixed root alias only if deployment under a subdirectory is approved;
S17 currently rejects non-root deployment explicitly.

## Required evidence before GREEN

1. Add a failing S18 test whose server/fetch port returns index bytes at `/` and
   a redirect at `/index.html`. Assert installation requests `/`, publishes the
   validated response under `/index.html`, and serves both root and index
   navigations through S19. Assert other assets retain their exact fetch URLs.
2. Check wrong root bytes, MIME, headers, redirects and failed update preservation
   using the existing cache testbench; no validation may be removed or relaxed.
3. Rerun the complete S16–S21 unit/real-browser ladder and the launcher regression.
4. Build production output and install it in a fresh Chrome context through
   **local Wrangler**, then go offline and reload. Verify every precached response
   retains exact manifest bytes and the three isolation headers. This is local
   deployment-server evidence, not proof of a live hosted deployment.

Parent owns the final shared build and requirement ledger. The offline agent
owns the S18 testbench/correction and documentation link to this amendment.
