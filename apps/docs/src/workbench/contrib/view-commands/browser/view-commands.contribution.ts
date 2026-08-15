import { CommandsRegistry } from '@/platform/commands/common/commands';
import { getViewContainers } from '@/platform/views/viewContainerRegistry';
import { parseLocalizedPathname } from '@/lib/i18n';

/**
 * Registers one "View: Show X" command per view container, generated
 * from `viewContainerRegistry` rather than hand-listed -- the same
 * relationship VS Code's palette has to its own registered views. Adding
 * a new view container (a new `*.contribution.ts` importing
 * `registerViewContainer`) makes it searchable in the Command Palette
 * with no extra step.
 *
 * Navigation is a plain `window.location.assign`, not the Next.js
 * router's soft navigation -- a command handler is a bare function with
 * no React context to pull `useRouter()` from, and this workbench has
 * exactly two views, so the cost of a full navigation here is not worth
 * threading a router reference through command registration to avoid.
 */
function currentLang(): string {
  // Was `window.location.pathname.split('/')[1] || 'tr'` -- a real bug:
  // that reads the first *route* segment as if it were always the locale,
  // which only holds for an explicitly-prefixed URL (`/en/ide` -> "en").
  // With `hideLocale: 'default-locale'` (see `lib/i18n.ts`), bare `/docs`
  // and `/ide` have "docs"/"ide" as their first segment -- this returned
  // `lang: "ide"` on the IDE's own bare URL, which `container.getHref`
  // then built into a broken `/ide/ide` href. `parseLocalizedPathname`
  // treats an unrecognized first segment as the hidden-prefix default
  // locale instead of assuming it's always a locale code.
  return parseLocalizedPathname(window.location.pathname).lang;
}

for (const container of getViewContainers()) {
  CommandsRegistry.register({
    id: `workbench.view.${container.id}`,
    title: `View: Show ${container.title}`,
    handler: () => {
      window.location.assign(container.getHref(currentLang()));
    },
  });
}
