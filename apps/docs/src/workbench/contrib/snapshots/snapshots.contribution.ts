import { Camera } from 'lucide-react';
import { registerViewContainer } from '@/platform/views/viewContainerRegistry';

registerViewContainer({
  id: 'workbench.view.snapshots',
  title: 'VM Snapshots',
  icon: Camera,
  order: 2,
  getHref: (lang) => `/${lang}/ide?view=snapshots`,
  isActive: (pathname, lang, view) =>
    pathname === `/${lang}/ide` && view === 'snapshots',
});
