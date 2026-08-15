import { Bug } from 'lucide-react';
import { registerViewContainer } from '@/platform/views/viewContainerRegistry';

registerViewContainer({
  id: 'workbench.view.debug',
  title: 'Run and Debug',
  icon: Bug,
  order: 1,
  getHref: (lang) => `/${lang}/ide?view=debugger`,
  isActive: (pathname, lang, view) =>
    pathname === `/${lang}/ide` && view === 'debugger',
});
