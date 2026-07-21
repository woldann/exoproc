# NThread çağrı yaşam döngüsü

Bir `NThread` ömrü boyunca bir OS thread'i sürer. Varsayılan factory yolunda hangi thread'in seçileceği `init()` sırasında belirlenir; `createAccessor()` ise bu işlemi bekleyip hazır accessor döndürür.

```text
init: aday thread'i yakala → tam context'i kaydet → spin stub'da park et
call: context/stack'i çağrı için kur → thread'i resume et → spin stub'a dönüşü bekle
deinit: özgün context'i uygula → thread'i bırak → accessor kaynaklarını kapat
```

## Başlatma ve iki aşamalı dönüş zinciri

Başlatma, sistem modüllerindeki spin, `push reg; ret`, `jmp reg`, `ret` ve `add rsp, 0x28; ret` dizileri için yapılan taramanın tamamlanmasını bekler. Ardından thread context'i alınır, gerekli pivot stub'ları seçilir ve thread spin stub üzerinde park edilir. Bu aşama tamamlanmadan çağrı yapmaya çalışmak yerine factory'nin resolve olmasını veya doğrudan oluşturulan accessor için `await init()` tamamlanmasını bekleyin.

Kaydedilen snapshot yalnızca `RIP` ve `RSP` değildir: genel amaçlı register'lar, control alanları ve XMM register'ları da içerilir. Bu, deinit sonrasında thread'i yakalandığı noktaya mümkün olduğunca yakın şekilde geri bırakmak içindir; hedefte o sırada tutulmuş lock'ların semantiğini geri sarmaz.

Park edildikten sonra NThread çağrı stack'ini doğrudan soyut bir şema olarak varsaymaz; `push reg; ret` stub'ını iki aşamada çalıştırarak zinciri stack üzerinde kurar ve spin noktasına geri döner:

```text
Stage A: RSP = callRsp + 56
         push spinStub; ret
         → spinStub adresinin [callRsp + 48] slotuna yerleştiğini kurar

Stage B: RSP = callRsp + 8
         push addRsp28RetStub; ret
         → ilk ret add rsp, 0x28; ret stub'ına gider
         → ikinci ret [callRsp + 48]'deki spinStub'a gider
```

Stage B'deki iki ardışık `ret`, normal sıfır-stack-argümanlı çağrının dönüş yolunu daha çağrı yapılmadan yürütür: `callRsp`'deki temizleyici, 32 byte shadow space ve spin park noktası birlikte doğrulanmış olur. Bu, sonraki çağrılarda thread'in hedef fonksiyondan aynı, bilinen park durumuna dönmesinin temelidir. Zincir kurulurken bir aşama hedefte beklenen biçimde spin'e dönmezse init başarısız olur; bu yüzden bu ayrıntı stabilite için önemlidir.

## Bir çağrı

NThread parametreleri context ve gerektiğinde stack slotlarına yazar, `RIP`'i hedef fonksiyona ayarlar ve thread'i resume eder. Hedef fonksiyon dönüşte `callRsp`'deki `add rsp, 0x28; ret` zincirini izleyerek yeniden spin stub'a gelirse NThread context'i okur ve sonucu döndürür. Dörtten fazla parametre varsa çağrı için ek stack temizleme stub'ı ayrılır; çağrı sonrasında temel dönüş zinciri geri yazılmaya çalışılır.

Async `call()` park noktasını polling ile bekler. `callSync()` aynı işi JavaScript thread'ini yield etmeden busy-spin ile yapar; uzun çağrıda host CPU'sunu tüketir. Timeout, yalnızca fonksiyonun yavaş olduğunu değil, spin park noktasına dönemediğini ifade eder.

## Temizleme ve başarısızlık

`deinit()` normal yaşam döngüsünün parçasıdır. Kaydedilen context'i geri uygular, NThread'in thread handle'ını ve kullandığı geçici kaynakları kapatır. Her çağrı zincirini `try/finally` ile kurun.

Timeout veya thread ölümü sonrasında thread'in hangi durumda kaldığı belirsiz olabilir. Aynı accessor üzerinde körlemesine yeni context yazmayın; hedef/thread durumunu inceleyin ve kontrollü testte yeni bir accessor ile yeniden başlayın.
