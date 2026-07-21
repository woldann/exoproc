# Paket haritası

| Paket               | Sorumluluk                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `bun-xffi`          | Cross-process FFI tabanı: C ABI türleri, struct/union yerleşimi, accessor'lar, TinyCC JIT |
| `bun-winapi`        | Process, thread, module, memory ve context için Win32 sarmalayıcıları                     |
| `bun-nthread`       | Mevcut hedef thread'ini yönlendirerek çağrı yürütme                                       |
| `exoproc-accessors` | NThread'i dolaylı bellek/çağrı zincirine bağlayan middleware'ler                          |
| `bun-nhook`         | 2 byte `EB FE` park-and-simulate inline hook                                              |
| `bun-minhook`       | 5 byte detour ve taşınmış trampoline hook                                                 |
| `bun-capstone`      | Talimat çözümleme için Capstone bağları                                                   |
| `bun-nshm`          | Paylaşılan bellek yardımcıları                                                            |

Uygulama yazarken en basit giriş noktası, `exoproc` paketinden gelen `createAccessor()` işleviyle tam accessor zincirini kurmaktır. `exoproc-utils` ortak yardımcı katmandır; onun dışında `bun-xffi` tüm işlevsel katmanların tabanıdır. `bun-winapi` Windows nesnelerini bu zeminde sarmalar, `bun-nthread` ise thread ve root accessor yaşam döngüsünü sizin kurduğunuz ileri seviye yoldur.
