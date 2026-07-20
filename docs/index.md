---
layout: home

hero:
  name: Exoproc
  text: Windows x64 süreçler arası enstrümantasyon
  tagline: DLL enjekte etmeden ve CreateRemoteThread oluşturmadan, TypeScript ile uzaktaki süreç belleği ve thread'leri üzerinde çalışın.
  actions:
    - theme: brand
      text: Başlangıç
      link: /getting-started
    - theme: alt
      text: NThread tasarımı
      link: /nthread/overview

features:
  - title: NThread
    details: Hedef sürecin mevcut thread'ini park edip bağlamını yönlendirerek uzaktaki çağrıları yürütür.
  - title: Birleşik accessor modeli
    details: Yerel, uzak ve thread-yönlendirmeli bellek üzerinde aynı read/write/call arayüzü.
  - title: Hook seçenekleri
    details: EB FE ile park-and-simulate veya klasik trampoline/detour yaklaşımı.
---

## Bu dokümantasyonun odağı

API kullanımının yanında, sistemin neden bu şekilde tasarlandığını anlatır: NThread neden vardır, Windows x64 ABI çağrıyı nasıl şekillendirir, hangi varsayımlar geçerlidir ve bir hata hedef süreci hangi koşullarda çökertebilir.

Bu proje yalnızca yetkili güvenlik araştırması, hata ayıklama ve eğitim amaçlı kullanılmalıdır.
