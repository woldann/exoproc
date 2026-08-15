import { Suspense } from 'react';
import { RootProvider } from 'fumadocs-ui/provider/next';
import '../global.css';
import { Inter } from 'next/font/google';
import { i18n } from '@/lib/i18n';
import { IdeActivityBar } from '@/components/ide/IdeActivityBar';
import { TooltipProvider } from '@/components/ui/tooltip';

// `IdeActivityBar` reads `useSearchParams()` (to tell the three IDE views
// apart now that they share one route, see `IdeWorkbench`) -- Next.js
// requires a Suspense boundary around that so pages that *are* statically
// prerendered (the docs pages this same activity bar renders on) don't
// deopt to fully dynamic rendering. The fallback matches the real bar's
// width/background exactly to avoid any layout shift.
function ActivityBarFallback() {
  return (
    <aside
      aria-hidden="true"
      className="sticky top-0 z-60 h-dvh w-13 shrink-0 border-r border-white/10 bg-[#181818]"
    />
  );
}

const inter = Inter({
  subsets: ['latin'],
});

export default async function Layout({
  params,
  children,
}: LayoutProps<'/[lang]'>) {
  const { lang } = await params;

  return (
    <html lang={lang} className={inter.className} suppressHydrationWarning>
      <body className="min-h-screen">
        <RootProvider i18n={i18n.provider(lang)}>
          <TooltipProvider>
            <div className="flex min-h-screen">
              <Suspense fallback={<ActivityBarFallback />}>
                <IdeActivityBar lang={lang} />
              </Suspense>
              <div className="min-w-0 flex-1">{children}</div>
            </div>
          </TooltipProvider>
        </RootProvider>
      </body>
    </html>
  );
}

export async function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }));
}
