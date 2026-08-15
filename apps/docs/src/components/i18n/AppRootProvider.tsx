'use client';

import type { ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { i18n, localizedPath, parseLocalizedPathname } from '@/lib/i18n';

export interface AppRootProviderProps {
  readonly lang: string;
  readonly children: ReactNode;
}

/**
 * Wraps fumadocs' `RootProvider` with a custom `onLocaleChange`, replacing
 * its built-in language-switcher default (`I18nProvider`'s `onChange` in
 * `fumadocs-ui/contexts/i18n.js`). That default assumes the current
 * pathname's first segment IS the active locale (`segments[0] === locale`)
 * and either unshifts or swaps it in place -- true for `hideLocale: 'never'`,
 * but not here: with `hideLocale: 'default-locale'` (see `lib/i18n.ts`),
 * Turkish's pathname never has a leading `/tr` segment at all, and swapping
 * `en` -> `tr` in place produces `/tr/docs/...` instead of stripping the
 * prefix -- a real, reported bug (switching en -> tr kept an explicit `/tr`
 * in the URL, when the whole point of `hideLocale` is that `/tr` never
 * appears). `parseLocalizedPathname` (`lib/i18n.ts`) strips any existing
 * `en`/`tr` prefix first (treating a bare path as the hidden-prefix default
 * locale rather than misreading its first segment as the locale); then
 * `localizedPath` reapplies the right one for the target locale, omitting
 * it again if switching back to the default -- correct in both directions.
 */
export function AppRootProvider({ lang, children }: AppRootProviderProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';

  const onLocaleChange = (nextLocale: string) => {
    const { rest } = parseLocalizedPathname(pathname);
    router.push(localizedPath(nextLocale, rest));
  };

  return (
    <RootProvider i18n={{ ...i18n.provider(lang), onLocaleChange }}>
      {children}
    </RootProvider>
  );
}
