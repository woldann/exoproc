# Sorun giderme

Bir hata mesajını tek başına değil, çağrının hangi aşamasında oluştuğuyla birlikte değerlendirin. NThread, accessor ve hook katmanları aynı process üzerinde çalıştığı için aynı `timeout` belirtisi farklı nedenlerden çıkabilir.

## Başlatma hataları

### `NoSleepAddressError` / `NoPushretAddressError` / `NoJumpAddressError`

NThread'in ihtiyaç duyduğu küçük talimat stub'ları sistem modüllerinde bulunamadı veya tarama tamamlanmadan kullanıma geçildi.

Kontrol sırası:

1. Process'in Windows x64 olduğundan emin olun.
2. `ntdll`, `kernel32` ve `kernelbase` modüllerinin hedefte yüklü olduğunu kontrol edin.
3. Async başlatmada `await memory.init()` tamamlanmadan `call` yapılmadığını doğrulayın.
4. Wine kullanıyorsanız Windows Bun sürümünü ve Wine prefix mimarisini kontrol edin.

### Access denied

Bu hata her zaman izin eksikliği anlamına gelmez. Hedef process kapanıyor olabilir, thread ID artık geçerli olmayabilir veya istenen Win32 erişim maskesi hedefin güvenlik politikasına uymuyor olabilir. Önce process/thread yaşamını, sonra erişim haklarını inceleyin.

## Çağrı hataları

### `CallTimeoutError`

Hedef fonksiyon dönüş zinciriyle spin stub'a dönmedi. En yaygın nedenler:

- fonksiyon uzun sürüyor veya bloke oluyor,
- yanlış adres ya da yanlış calling convention kullanılıyor,
- hedef thread lock/loader bölgesinde askıya alınmış durumda,
- thread başka bir kod yolu tarafından sonlandırıldı,
- hook veya başka bir suspend/resume sahibi ile suspend sayacı çakıştı.

Timeout sonrasında aynı context'i tekrar yazmadan önce hedef thread'in `exit code`, `RIP` ve `RSP` durumunu okuyun. `timeoutMs` değerini yükseltmek yalnızca çağrının gerçekten uzun sürdüğü doğrulanmışsa anlamlıdır.

### `CallThreadDiedError`

Thread, çağrı sırasında öldü veya context okunamaz hale geldi. `ExitThread` veya noreturn fonksiyonları NThread çağrısı olarak kullanmayın. Hedefi yeniden başlatıp aynı çağrıyı daha küçük ve geri dönen bir fonksiyonla izole edin.

### Stack mismatch uyarısı

`expectedRsp` ayarlanmışsa bu denetim hem async `call()` hem `callSync()` dönüşünde yapılır. Çağrı sonrası gerçek `RSP`, beklenen değerden farklıysa yanlış ABI, eksik stack argümanı, çağrının stack'i değiştirmesi veya dönüş stub'ının beklenmeyen bir yoldan çalışması söz konusu olabilir. Uyarıyı görmezden gelip aynı thread'de art arda çağrılar yapmak bir sonraki `ret` sırasında crash'e dönüşebilir.

## Hook hataları

### Hook hit alınmıyor

Hedef fonksiyon hiç çağrılmıyor olabilir; yanlış modül sürümündeki adres kullanılmış olabilir veya hook yanlış process'e yazılmış olabilir. Önce `originalBytes` ile hedefteki byte'ları ve process PID'sini doğrulayın.

### Hook disable sonrası crash

Disable sırasında park edilmiş thread'ler hâlâ eski `EB FE` konumunda olabilir veya özgün byte'lar tam talimat sınırında geri yüklenmemiş olabilir. `poll()` ile bekleyen hit'leri tüketin, `disable()` tamamlanmadan process'i kapatmayın ve `destroy()` çağrısını en sona bırakın.

### MinHook detour çalışmıyor

Detour adresi 32-bit relative jump sınırının dışında olabilir. MinHook bunu yakın relay ile çözmeye çalışır; relay allocation/protection başarısızsa hedefin adres alanını ve `allocNear` yeteneğini kontrol edin. Ayrıca detour machine-code'un hedef process'e gerçekten taşındığını doğrulayın.

## Tanı için loglama

Sorunu tekrar üretirken şu değerleri aynı çağrı için kaydedin:

- hedef PID ve driving thread ID,
- hedef fonksiyon adresi ve ilk byte'ları,
- çağrı öncesi/sonrası `RIP`, `RSP`, `RCX`, `RDX`, `RAX`,
- argüman türleri ve stack argümanı sayısı,
- timeout sonucu ve thread exit durumu.

Adresleri loglarken hex formatı kullanın; pointer değerlerini JavaScript `number` içine zorlayarak 64-bit hassasiyetini kaybetmeyin.
