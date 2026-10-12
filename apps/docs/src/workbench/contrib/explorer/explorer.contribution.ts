import { Files } from 'lucide-react';
import { registerViewContainer } from '@/platform/views/viewContainerRegistry';
import { localizedPath } from '@/lib/i18n';

registerViewContainer({
  id: 'workbench.view.explorer',
  title: 'Explorer',
  icon: Files,
  order: 0,
  getHref: (lang) => localizedPath(lang, '/ide'),
  isActive: (pathname, lang, view) =>
    pathname === localizedPath(lang, '/ide') && view === 'explorer',
});
