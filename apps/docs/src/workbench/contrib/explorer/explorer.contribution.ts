import { Files } from 'lucide-react';
import { registerViewContainer } from '@/platform/views/viewContainerRegistry';

registerViewContainer({
  id: 'workbench.view.explorer',
  title: 'Explorer',
  icon: Files,
  order: 0,
  getHref: (lang) => `/${lang}/ide`,
  isActive: (pathname, lang, view) =>
    pathname === `/${lang}/ide` && view === 'explorer',
});
