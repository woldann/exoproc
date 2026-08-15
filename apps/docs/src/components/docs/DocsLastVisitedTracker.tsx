'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { DOCS_LAST_VISITED_COOKIE } from '@/lib/docs-last-visited';

const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Records every docs page visited, so bare `/[lang]/docs` (see
 * `docs/[[...slug]]/page.tsx`) can send the user back to wherever they left
 * off instead of always resetting to `getting-started`. A cookie rather
 * than `localStorage` specifically because the redirect target is decided
 * server-side (in the page itself, before any client JS runs) so a hard
 * navigation or first paint never flashes `getting-started` before
 * bouncing again.
 *
 * Never actually mounts for the bare `/docs` request itself: that request
 * redirects before the layout's response is ever sent to the browser, so
 * there's no risk of this overwriting a real "last visited" page with the
 * redirect stop itself.
 */
export function DocsLastVisitedTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    document.cookie = `${DOCS_LAST_VISITED_COOKIE}=${encodeURIComponent(pathname)}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
  }, [pathname]);

  return null;
}
