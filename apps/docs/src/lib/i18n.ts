import { defineI18nUI } from 'fumadocs-ui/i18n';

// Turkish is the default language, but `hideLocale` stays 'never': fumadocs'
// own hideLocale support relies on middleware (`proxy.ts`) to rewrite
// unprefixed requests onto `/tr/...` internally, and `proxy.ts` was dropped
// because Next.js 16's proxy is Node.js-runtime-only, which OpenNext
// Cloudflare doesn't support. So every internal link (nav, language
// switcher, generateStaticParams, ...) still points at the fully
// `/tr/...`-prefixed URL. Someone landing on an unprefixed `/docs` or `/ide`
// directly still gets served Turkish, just via a plain `rewrites()` entry
// in `next.config.mjs` instead (edge/Workers-compatible, no middleware
// needed) -- that only covers the request path, it doesn't change what
// URLs this app itself generates.
// `parser: 'dir'` expects one subfolder per locale under `content/docs`
// (`content/docs/tr/...`, `content/docs/en/...`).
export const i18n = defineI18nUI(
  {
    languages: ['tr', 'en'],
    defaultLanguage: 'tr',
    hideLocale: 'never',
    parser: 'dir',
  },
  {
    tr: { displayName: 'Türkçe' },
    en: { displayName: 'English' },
  },
);
