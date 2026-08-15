import { defineI18nUI } from 'fumadocs-ui/i18n';

// Turkish is the default language, but its URL prefix is NOT hidden: hiding it
// requires middleware (`proxy.ts`) to rewrite unprefixed requests onto
// `/tr/...` internally, and `proxy.ts` was dropped because Next.js 16's
// proxy is Node.js-runtime-only, which OpenNext Cloudflare doesn't support.
// So every locale, including tr, always shows its prefix; `/` static-redirects
// to `/tr` instead (see `next.config.mjs`).
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
