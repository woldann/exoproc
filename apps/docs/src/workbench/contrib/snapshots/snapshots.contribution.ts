import { Camera } from 'lucide-react';
import { registerViewContainer } from '@/platform/views/viewContainerRegistry';
import { localizedPath } from '@/lib/i18n';

registerViewContainer({
  id: 'workbench.view.snapshots',
  title: 'VM Snapshots',
  icon: Camera,
  order: 2,
  getHref: (lang) => `${localizedPath(lang, '/ide')}?view=snapshots`,
  isActive: (pathname, lang, view) =>
    pathname === localizedPath(lang, '/ide') && view === 'snapshots',
});
