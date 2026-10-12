import { Bug } from 'lucide-react';
import { registerViewContainer } from '@/platform/views/viewContainerRegistry';
import { localizedPath } from '@/lib/i18n';

registerViewContainer({
  id: 'workbench.view.debug',
  title: 'Run and Debug',
  icon: Bug,
  order: 1,
  getHref: (lang) => `${localizedPath(lang, '/ide')}?view=debugger`,
  isActive: (pathname, lang, view) =>
    pathname === localizedPath(lang, '/ide') && view === 'debugger',
});
