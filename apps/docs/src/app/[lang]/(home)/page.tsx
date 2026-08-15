import Link from 'next/link';
import { i18n } from '@/lib/i18n';

const content = {
  tr: {
    title: 'Exoproc',
    text: 'Windows x64 süreçler arası enstrümantasyon',
    tagline:
      "DLL enjekte etmeden ve CreateRemoteThread oluşturmadan, TypeScript ile uzaktaki süreç belleği ve thread'leri üzerinde çalışın.",
    primaryAction: { text: 'Başlangıç', href: '/tr/docs/getting-started' },
    secondaryAction: {
      text: 'NThread tasarımı',
      href: '/tr/docs/nthread/overview',
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
    primaryAction: { text: 'Get started', href: '/en/docs/getting-started' },
    secondaryAction: {
      text: 'NThread design',
      href: '/en/docs/nthread/overview',
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
    <div className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="flex max-w-2xl flex-col items-center text-center">
        <h1 className="text-4xl font-bold">{c.title}</h1>
        <p className="mt-2 text-xl text-fd-muted-foreground">{c.text}</p>
        <p className="mt-4 text-fd-muted-foreground">{c.tagline}</p>
        <div className="mt-6 flex gap-3">
          <Link
            href={c.primaryAction.href}
            className="rounded-lg bg-fd-primary px-4 py-2 font-medium text-fd-primary-foreground"
          >
            {c.primaryAction.text}
          </Link>
          <Link
            href={c.secondaryAction.href}
            className="rounded-lg border px-4 py-2 font-medium"
          >
            {c.secondaryAction.text}
          </Link>
        </div>
      </div>

      <div className="mt-16 grid max-w-4xl gap-6 sm:grid-cols-3">
        {c.features.map((feature) => (
          <div key={feature.title} className="rounded-lg border p-4">
            <h3 className="font-semibold">{feature.title}</h3>
            <p className="mt-2 text-sm text-fd-muted-foreground">
              {feature.details}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-16 max-w-2xl">
        <h2 className="text-lg font-semibold">{c.coversTitle}</h2>
        <p className="mt-2 text-fd-muted-foreground">{c.covers}</p>
        <p className="mt-4 text-sm text-fd-muted-foreground">{c.disclaimer}</p>
      </div>
    </div>
  );
}
