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
const bunFfiTarget = path.resolve(__dirname, '../../packages/simulate/dist/runtime/bun-ffi.js');

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // `proxy.ts` (Next.js 16's renamed middleware) was dropped: it's
  // Node.js-runtime-only with no Edge option, which OpenNext Cloudflare
  // doesn't support ("Node.js middleware is not currently supported").
  // It used to hide the default (tr) locale's URL prefix and redirect `/`
  // there implicitly; now every locale is always prefixed (see
  // `src/lib/i18n.ts`'s `hideLocale: 'never'`) and this static redirect
  // covers the bare `/` case.
  async redirects() {
    return [{ source: '/', destination: '/tr', permanent: false }];
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
