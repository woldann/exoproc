import Link from 'next/link';
import { i18n } from '@/lib/i18n';
import { HomeShowcase } from '@/components/home/HomeShowcase';

const content = {
  tr: {
    title: 'Exoproc',
    text: 'Windows x64 süreçler arası enstrümantasyon',
    tagline:
      "DLL enjekte etmeden ve CreateRemoteThread oluşturmadan, TypeScript ile uzaktaki süreç belleği ve thread'leri üzerinde çalışın.",
    primaryAction: { text: 'Dokümantasyon', href: '/docs' },
    secondaryAction: {
      text: 'Web IDE',
      href: '/ide',
    },
    features: [
      {
        title: 'NThread',
        details:
          "Hedef sürecin mevcut thread'ini park edip bağlamını yönlendirerek uzaktaki çağrıları yürütür.",
      },
      {
        title: 'Birleşik accessor modeli',
        details:
          'Yerel, uzak ve thread-yönlendirmeli bellek üzerinde aynı read/write/call arayüzü.',
      },
      {
        title: 'Hook seçenekleri',
        details:
          'EB FE ile park-and-simulate veya klasik trampoline/detour yaklaşımı.',
      },
    ],
    coversTitle: 'Bu dokümantasyonun odağı',
    covers:
      'API kullanımının yanında, sistemin neden bu şekilde tasarlandığını anlatır: NThread neden vardır, Windows x64 ABI çağrıyı nasıl şekillendirir, hangi varsayımlar geçerlidir ve bir hata hedef süreci hangi koşullarda çökertebilir.',
    disclaimer:
      'Bu proje yalnızca yetkili güvenlik araştırması, hata ayıklama ve eğitim amaçlı kullanılmalıdır.',
  },
  en: {
    title: 'Exoproc',
    text: 'Cross-process instrumentation for Windows x64',
    tagline:
      'Work with remote process memory and threads from TypeScript, without DLL injection or CreateRemoteThread.',
    primaryAction: { text: 'Documentation', href: '/en/docs' },
    secondaryAction: {
      text: 'Web IDE',
      href: '/en/ide',
    },
    features: [
      {
        title: 'NThread',
        details:
          'Runs remote calls by parking and redirecting a live target thread.',
      },
      {
        title: 'Unified accessor model',
        details:
          'One read/write/call surface for local, remote, and thread-redirected memory.',
      },
      {
        title: 'Hook choices',
        details: 'EB FE park-and-simulate or a conventional trampoline/detour.',
      },
    ],
    coversTitle: 'What these docs cover',
    covers:
      'Alongside API usage, these docs explain why the system is designed this way: the NThread execution model, Windows x64 ABI boundaries, lifecycle ownership, and the conditions that can crash or stall a target process.',
    disclaimer:
      'Use Exoproc only for authorized security research, debugging, and education.',
  },
} as const;

export default async function HomePage(props: PageProps<'/[lang]'>) {
  const { lang } = await props.params;
  const c =
    content[lang as keyof typeof content] ??
    content[i18n.defaultLanguage as keyof typeof content];

  return (
    <div className="flex flex-1 flex-col items-center px-4 pt-3 pb-16 sm:px-6">
      {/* Compact Top Header Bar */}
      <div className="mb-4 flex w-full max-w-4xl flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {c.title}
            </h1>
            <span className="rounded-md border border-white/10 bg-neutral-900/90 px-2 py-0.5 text-xs font-mono font-medium text-neutral-300">
              v0.1.0
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-400 sm:text-sm">{c.text}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href={c.primaryAction.href}
            className="rounded-lg bg-fd-primary px-4 py-2 text-xs font-semibold text-fd-primary-foreground shadow-sm transition-opacity hover:opacity-90 sm:text-sm"
          >
            {c.primaryAction.text}
          </Link>
          <Link
            href={c.secondaryAction.href}
            className="rounded-lg border border-white/10 bg-neutral-900/60 px-4 py-2 text-xs font-semibold transition-colors hover:bg-neutral-800 sm:text-sm"
          >
            {c.secondaryAction.text}
          </Link>
        </div>
      </div>

      {/* Editor + Terminal Interactive Showcase (Immediately Visible) */}
      <div className="flex w-full justify-center">
        <HomeShowcase lang={lang} />
      </div>

      {/* Description & Features Below */}
      <div className="mt-12 max-w-2xl text-center">
        <p className="text-sm text-neutral-300 sm:text-base">{c.tagline}</p>
      </div>

      <div className="mt-8 grid max-w-4xl gap-6 sm:grid-cols-3">
        {c.features.map((feature) => (
          <div
            key={feature.title}
            className="rounded-lg border border-white/10 bg-neutral-900/40 p-4"
          >
            <h3 className="font-semibold text-neutral-200">{feature.title}</h3>
            <p className="mt-2 text-sm text-neutral-400">{feature.details}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 max-w-2xl text-center">
        <h2 className="text-base font-semibold text-neutral-300">
          {c.coversTitle}
        </h2>
        <p className="mt-2 text-sm text-neutral-400">{c.covers}</p>
        <p className="mt-4 text-xs text-neutral-500">{c.disclaimer}</p>
      </div>
    </div>
  );
}
