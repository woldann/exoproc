import { defineI18nUI } from 'fumadocs-ui/i18n';

/** Kept in sync with `defaultLanguage` below by hand -- `defineI18nUI`'s return value doesn't re-expose it in a form worth destructuring from. */
export const DEFAULT_LOCALE = 'tr';

// Turkish is the default language and its prefix is hidden (`hideLocale:
// 'default-locale'`): every fumadocs-generated link (sidebar, breadcrumbs,
// language switcher, ...) for Turkish content omits the `/tr` segment,
// while English content keeps its `/en` prefix. Own app-level links (the
// activity bar's Docs button, view-container hrefs, ...) do the same via
// `localizedPath` below -- keep using it there rather than hand-rolling
// `` `/${lang}${path}` ``, or they'll drift from what fumadocs itself
// generates.
//
// fumadocs' own `hideLocale` support normally pairs this with middleware
// (`proxy.ts`) that rewrites an incoming unprefixed request onto
// `/tr/...` -- dropped because Next.js 16's proxy is Node.js-runtime-only,
// which OpenNext Cloudflare doesn't support. `next.config.mjs`'s
// `rewrites()` does that part instead (edge/Workers-compatible, no
// middleware needed), and additionally content-negotiates via the
// `Accept-Language` header so an unprefixed request actually lands on
// English for an English browser rather than always defaulting to
// Turkish (confirmed fumadocs' own middleware does not do this for
// `hideLocale: 'default-locale'` -- it hardcodes the default language
// unconditionally for a bare path; the negotiation this app wants is
// bespoke, not something disabling middleware merely lost).
// `parser: 'dir'` expects one subfolder per locale under `content/docs`
// (`content/docs/tr/...`, `content/docs/en/...`).
export const i18n = defineI18nUI(
  {
    languages: ['tr', 'en'],
    defaultLanguage: DEFAULT_LOCALE,
    hideLocale: 'default-locale',
    parser: 'dir',
  },
  {
    tr: { displayName: 'Türkçe' },
    en: { displayName: 'English' },
  },
);

/** Builds a same-site path for `lang`, omitting the segment entirely for `DEFAULT_LOCALE` -- mirrors fumadocs' own `hideLocale: 'default-locale'` link generation for the app's own (non-fumadocs-generated) links. `path` must start with `/`. */
export function localizedPath(lang: string, path: string): string {
  return lang === DEFAULT_LOCALE ? path : `/${lang}${path}`;
}
