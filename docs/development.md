# Geliştirme ve test

Exoproc bir Bun workspace monorepo'sudur. Ana hedef Windows x64'tür; Linux geliştirme ortamında Windows Bun, Wine üzerinden `bun-wine` betiğiyle çalıştırılabilir.

## Temel komutlar

```bash
bun install
bun run build
bun run lint
bun run typecheck
bun test
```

Bun 1.3 veya üstü gereklidir. `bun install`, Capstone gibi yerel bağımlılıkların indirilmesini de tetikler.

## Wine ile test

Windows FFI kullanan test ve betikleri Linux üzerinde Wine ile çalıştırın:

```bash
BUN_WIN_DIR=/path/to/bun-windows-x64 ./bun-wine test
BUN_WIN_DIR=/path/to/bun-windows-x64 ./bun-wine test tests/nthread/nthread.test.ts
```

Örneklerin istemci paketleri normal build ile önceden oluşturulur; ardından örnek Wine üzerinden başlatılır. `notepad-keystroke-hook`, yalnızca kendi başlattığı Notepad sürecini hedefleyen gözlemsel NHook örneğidir.

## Dokümantasyon

```bash
bun run docs:dev
bun run docs:build
```

### Branch önizlemeleri

`feature/docs`, `docs/*`, `feature/docs/*` veya `feature/docs-*` adlandırmasındaki branch'ler; `docs/`, VitePress yapılandırması ya da docs bağımlılıklarını değiştirdiğinde GitHub Pages üzerinde ayrı bir önizleme üretir:

```text
https://woldann.github.io/exoproc/previews/<branch-adı>/
```

Örneğin `feature/docs` branch'i `/exoproc/previews/feature-docs/` altında yayınlanır. Branch adındaki `/` karakterleri URL'de `-` karakterine dönüştürülür. `main` branch'i ise üretim dokümantasyonunu `/exoproc/` kökünde günceller. Workflow özetinde build'e ait tam URL gösterilir.

VitePress `base` değeri workflow sırasında `DOCS_BASE` ile verilir. Yerel `bun run docs:dev` kullanımında base `/` olarak kalır.

Yeni teknik sayfa eklerken, yalnızca ideal akışı değil hata ve temizleme davranışını da yazın. Bu projede bir tasarım kararının değeri çoğu zaman hangi crash/deadlock sınıfını önlediğiyle anlaşılır.

Kod örneğini public export ve mevcut testlerden türetin. Varsayılan kullanım ile doğrudan constructor/low-level API kullanımını aynı örnekte karıştırmayın; lifecycle veya ABI davranışı için kaynakta olmayan garanti cümleleri kurmayın.
