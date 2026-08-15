import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMDX } from 'fumadocs-mdx/next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const withMDX = createMDX();

// No-op outside `next dev`; lets local dev access Cloudflare bindings (none
// currently declared beyond ASSETS/the self-reference service) the same way
// they'd be available once deployed via `opennextjs-cloudflare`.
initOpenNextCloudflareForDev();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// @exoproc/simulate and @exoproc/win32-abi are consumed as normal built
// workspace packages (their "main" points at dist/, like every other
// consumer in the monorepo -- see AGENTS.md's "Cross-package src/ imports
// can silently resolve to a stale dist/ build" note: run `bun run build` in
// those packages after changing their source). `bun:ffi` is a Bun built-in
// with no browser equivalent and no npm package to resolve normally, so it's
// aliased to the simulator's own compiled mock implementation of it. Using
// the compiled dist/ file (not the .ts source) avoids relying on Turbopack
// resolving explicit ".js" specifiers to sibling ".ts" files -- a NodeNext
// ESM+TS convention Turbopack doesn't support the way Vite/webpack do.
const bunFfiTarget = path.resolve(
  __dirname,
  '../../packages/simulate/dist/runtime/bun-ffi.js',
);

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // `proxy.ts` (Next.js 16's renamed middleware) was dropped: it's
  // Node.js-runtime-only with no Edge option, which OpenNext Cloudflare
  // doesn't support ("Node.js middleware is not currently supported").
  // It used to hide the default (tr) locale's URL prefix and negotiate
  // a bare `/` by `Accept-Language`; now that's done without middleware
  // (see `rewrites()` below) -- `/` itself just redirects to bare `/docs`
  // (not `/tr`, the separate marketing/home page) and lets that same
  // negotiation decide the language, rather than duplicating it here.
  // `DocsHomeRedirect` then bounces that to wherever
  // `DocsLastVisitedTracker` last recorded, or `getting-started` on a
  // first visit, so the site's actual entry point is the docs reader,
  // not a landing page pretending to be one.
  async redirects() {
    return [{ source: '/', destination: '/docs', permanent: false }];
  },
  // Without `proxy.ts` (see above), the default locale can't hide its own
  // prefix or content-negotiate the usual way -- but an unprefixed
  // `/docs`/`/ide` still needs to work, and land on whichever language the
  // visitor's browser actually prefers rather than always Turkish
  // (confirmed fumadocs' own middleware doesn't do this either even with
  // `hideLocale: 'default-locale'` -- it hardcodes the default language
  // unconditionally for a bare path; this negotiation is bespoke).
  // `rewrites()` (unlike `redirects()`) is invisible to the browser -- the
  // URL bar keeps showing `/docs`, only the internally-served content is
  // `/tr/docs` or `/en/docs` -- and, like `redirects()`, `has` conditions
  // (matching request headers) are resolved at the static routing layer
  // rather than in a Worker request handler, so this doesn't need the
  // Node.js runtime `proxy.ts` would.
  //
  // Two rules per route (English match, then an unconditional Turkish
  // fallback), not one with a fallback baked into the `has` regex: Next.js
  // tries `rewrites()` entries in order and stops at the first match, so
  // this reads the same as the middleware's own if/else would.
  //
  // Also two rules each for the *shape* of the path (bare `/docs`, then
  // `/docs/:path*`), not one `/docs/:path*`: that pattern's leading `/`
  // before `:path*` is a literal character, so it only matches
  // `/docs/...` (something has to follow that slash) and 404s on bare
  // `/docs` itself -- confirmed reproducing exactly that. The `{/:path*}`
  // optional-group syntax Next.js docs show for this exact case also
  // failed here ("Unexpected MODIFIER", a parser limitation in this
  // Next.js version) -- separate rules sidesteps needing it at all.
  async rewrites() {
    const englishHas = [
      { type: 'header', key: 'accept-language', value: '^en.*' },
    ];
    const localize = (path) => [
      { source: path, has: englishHas, destination: `/en${path}` },
      { source: path, destination: `/tr${path}` },
    ];
    return [
      ...localize('/docs'),
      ...localize('/docs/:path*'),
      ...localize('/ide'),
      ...localize('/ide/:path*'),
    ];
  },
  turbopack: {
    // Without this, Turbopack infers the workspace root itself by walking
    // up looking for lockfiles -- and finds two (this app's own, and the
    // monorepo root's `bun.lock`), so its guess is unstable across
    // environments. Locally that only ever surfaced as a warning ("Next.js
    // inferred your workspace root, but it may not be correct"); in
    // Cloudflare's build container the inferred root ends up somewhere
    // `next/package.json` isn't resolvable from, and `next build` treats
    // that as a hard error ("Turbopack build failed"). Pinning it to this
    // app's own directory removes the ambiguity outright.
    root: __dirname,
    resolveAlias: {
      'bun:ffi': './' + path.relative(__dirname, bunFfiTarget),
    },
  },
  webpack(webpackConfig) {
    webpackConfig.resolve.alias = {
      ...webpackConfig.resolve.alias,
      'bun:ffi': bunFfiTarget,
    };
    return webpackConfig;
  },
};

export default withMDX(config);
