# NThread çağrı yaşam döngüsü

Bir `NThread`, ömrü boyunca tam olarak bir OS thread'ini yönlendirir. Varsayılan factory yolunda hangi thread'in seçileceği `init()` sırasında belirlenir; `createAccessor()` ise bu işlemi bekleyip hazır accessor döndürür.

Aşağıdaki yavaşlatılmış modelde her clock darbesi bir instruction'ı ilerletir. Disassembly penceresi bütün kodu aynı anda göstermek yerine `RIP`'in geçtiği native kodu, farklı modüllerdeki stub konumlarını veya demo hedefini takip eder. Dokuz instruction grubu ve bellek adresleri öğretim için sabitlenmiştir; bunlar çalışan process'ten okunmuş gerçek adresler değildir.

<NThreadSimulator locale='tr' />

```text
init: thread'i suspend et → context'i kaydet → spin'e yönlendir → bir kez resume et
call: çalışan spin'de getContext → hedef context'i setContext → spin'e dönüşü bekle
deinit: çalışan spin'de savedContext'i setContext → özgün RIP'ten devam et → kaynakları kapat
```

## Başlatma ve iki aşamalı dönüş zinciri

Başlatma, sistem modüllerindeki spin, `push reg; ret`, `jmp reg`, `ret` ve `add rsp, 0x28; ret` dizileri için yapılan taramanın tamamlanmasını bekler. Ardından thread bir kez suspend edilir, context'i alınır, gerekli pivot stub'ları seçilir ve bir kez resume edilerek spin stub'daki `EB FE` döngüsünde çalışır durumda bırakılır. Bu aşama tamamlanmadan çağrı yapmaya çalışmak yerine factory'nin resolve olmasını veya doğrudan oluşturulan accessor için `await init()` tamamlanmasını bekleyin.

Bu ilk inişteki bir `SuspendThread()` ve bir `ResumeThread()` dışında çağrı yolu thread'in suspend count'una dokunmaz. `EB FE`, register veya belleği değiştirmediği için NThread spin'de çalışan thread'in context'ini güvenle okuyup değiştirebilir.

Kaydedilen snapshot yalnızca `RIP` ve `RSP` değildir: `INTEGER`, `CONTROL` ve `FLOATING_POINT` context grupları alınır; bunlar genel amaçlı register'ları, control alanlarını ve XMM state'ini kapsar. Simülatör okunabilirlik için `RIP`, `RSP`, `RAX`, `RBX`, `RBP`, `RCX`, `RDX`, `R8` ve `R9` alanlarını gösterir; simülatördeki NThread bu dokuz alanı yalnız `getContext()` ve `setContext()` üzerinden işler. Snapshot, deinit sonrasında thread'i yakalandığı noktaya mümkün olduğunca yakın şekilde geri bırakmak içindir; hedefte o sırada tutulmuş lock'ların semantiğini veya çağrıların bellek yan etkilerini geri sarmaz.

`savedContext` init sırasında iki kez kopyalanır. İlk kopya, thread ilk kez suspend edildiğinde özgün `RIP` ve jump register değerini güvenceye alır. `jumpStub → spinStub` inişinden sonra spin döngüsünde çalışan live context yeniden clone edilir; ikinci kopyanın `RIP` ve seçilmiş jump register alanı ilk kopyadaki özgün değerlerle patch edilir. Böylece çalışma snapshot'ı spin state'ini temel alırken deinit thread'i yakalandığı instruction'a bırakabilir. Simülatörde `CONTEXT BUS` ve `0/2 → 2/2 KOPYA` göstergeleri tam bu akışı gösterir.

Çağrı alanı yakalanan stack'in hemen altında değil, bir sayfa boşluk bırakılarak seçilir:

```text
stackBegin = align16(capturedRsp - 4096)
callRsp    = stackBegin - 136

örnek: capturedRsp = 0x000000A418F8C8C0
       stackBegin  = 0x000000A418F8B8C0
       callRsp     = 0x000000A418F8B838
```

Bu 4096 byte'lık pay, deinit sonrasında stack belleğinde kalabilen dispatch pointer'larının normal call chain'iyle erkenden çakışma riskini azaltır; stack belleği restore edilmez.

Thread spin döngüsüne ulaştıktan sonra NThread çağrı stack'ini doğrudan soyut bir şema olarak varsaymaz; `push reg; ret` stub'ını iki aşamada çalıştırarak zinciri stack üzerinde kurar ve spin noktasına geri döner:

```text
Stage A: RSP = callRsp + 56
         push spinStub; ret
         → spinStub adresinin [callRsp + 48] slotuna yerleştiğini kurar

Stage B: RSP = callRsp + 8
         push addRsp28RetStub; ret
         → ilk ret add rsp, 0x28; ret stub'ına gider
         → ikinci ret [callRsp + 48]'deki spinStub'a gider
```

Stage B'deki iki `ret` arasında `add rsp, 0x28` çalışır. Bu iki dönüş sıçraması normal sıfır-stack-argümanlı çağrının dönüş yolunu daha kullanıcı çağrısı gönderilmeden yürütür: `callRsp`'deki temizleyici, 32 byte shadow space ve spin dönüş noktası birlikte doğrulanmış olur. Bu, sonraki çağrılarda thread'in hedef fonksiyondan aynı, bilinen çalışan spin state'ine dönmesinin temelidir. Zincirin iki kere `ret` etmesi ve her iki seferde beklenen yere inmesi stabilite kontrolünün önemli parçasıdır; aşamalardan biri spin'e dönmezse init başarısız olur.

## Bir çağrı

NThread, thread `spinStub` üzerindeki `EB FE` döngüsünde çalışırken `getContext()` ile context'i alır; parametreleri ve gerektiğinde stack slotlarını hazırlayıp `RIP`'i hedef fonksiyona ayarlayarak `setContext()` uygular. Çağrı yolunda `SuspendThread()` veya `ResumeThread()` çalıştırılmaz. Hedef fonksiyon dönüşte `callRsp`'deki `add rsp, 0x28; ret` zincirini izleyerek yeniden spin stub'a gelir; poller `RIP == spinStub` durumunu görür ve sonucu context'ten okur. Enabled thread çağrılar arasında native uygulama kodunda dolaşmaz, `EB FE` spin döngüsünde çalışmaya devam eder. Dörtten fazla parametre varsa çağrı için ek stack temizleme stub'ı ayrılır; çağrı sonrasında temel dönüş zinciri geri yazılmaya çalışılır.

Async `call()` spin noktasını polling ile bekler. `callSync()` aynı işi JavaScript thread'ini yield etmeden busy-spin ile yapar; uzun çağrıda host CPU'sunu tüketir. Timeout, yalnızca fonksiyonun yavaş olduğunu değil, spin noktasına dönemediğini ifade eder.

## Temizleme ve başarısızlık

`deinit()` normal yaşam döngüsünün parçasıdır. Thread spin döngüsündeyken kaydedilen context'i `setContext()` ile geri uygular; thread ek bir resume gerektirmeden özgün `RIP`'ten devam eder. Ardından NThread'in thread handle'ı ve kullandığı geçici kaynaklar kapatılır. Her çağrı zincirini `try/finally` ile kurun.

Simülatörde **Disable**, otomatik demo çağrısı sürüyorsa onun spin'e dönmesini bekleyip ardından `deinit()` gösterimini başlatır. Bu bir arayüz güvenlik sırasıdır; gerçek kodda lifecycle sahibinin `call()` ile `deinit()` işlemlerini birbiriyle yarıştırmaması gerekir.

Timeout veya thread ölümü sonrasında thread'in hangi durumda kaldığı belirsiz olabilir. Aynı accessor üzerinde körlemesine yeni context yazmayın; hedef/thread durumunu inceleyin ve kontrollü testte yeni bir accessor ile yeniden başlayın.
