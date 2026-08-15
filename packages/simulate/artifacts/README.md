# Exoproc tarafından üretilen binary artifact'ları

> Bu dosyalar simülatörün bugün tam olarak ne ürettiğini gösterir. Henüz
> Windows PE32+ executable veya DLL dosyaları değildir.

Bu dizin yalnız geliştirme sırasında `bun run simulate:inspect` ile üretilir.
Generator `packages/simulate/scripts/` altındadır; runtime build'ine ve
yayınlanan npm paketine dahil edilmez. Sistemde NASM kuruluysa
`bun run simulate:inspect:nasm` bütün `.asm` dosyalarını relocatable
Win64 COFF object olarak assemble ederek doğrular.

## Executable image'ları

`.exe`, sanal dosya sistemine kurulan image'ın birebir kopyasıdır. İlk iki
byte'ı `MZ` olsa da PE header ve section table içermez; format
`EXOPROC64` adlı özel container'dır. `.text.bin` relocation öncesi compiler
byte'larını, `.linked.text.bin` loader'ın process memory'sine yazdığı
relocation sonrası byte'ları, `.iat.bin` salt-okunur Import Address Table
slotlarını ve `.data.bin` ortak data image'ını içerir. `.dis`; RIP-relative
`call [rip+disp32]` instruction'ını, IAT slot adresini, çözülen DLL exportunu,
virtual address'leri ve opcode byte'larını birlikte gösterir. `.asm` ise IAT
uygulama ayrıntısını göstermez; importları `extern WriteFile`, çağrıyı
`call WriteFile` olarak bırakır ve NASM'in Win64 COFF `REL32` relocation
kaydı üretmesini sağlar.
ABI kataloğu export adlarının bütün DLL'ler arasında benzersiz olduğunu
doğrular. `.json` section/symbol haritasıyla SHA-256 değerlerini taşır.

| Image          | .text byte | IAT byte | .data byte | Relocation |
| -------------- | ---------: | -------: | ---------: | ---------: |
| `cat.exe`      |        305 |       48 |       4155 |         13 |
| `cd.exe`       |         81 |       16 |         48 |          4 |
| `chdir.exe`    |         81 |       16 |         48 |          4 |
| `clear.exe`    |        101 |       24 |          4 |          4 |
| `cls.exe`      |        101 |       24 |          4 |          4 |
| `cmd.exe`      |        534 |       64 |       4592 |         28 |
| `dir.exe`      |        443 |       48 |        704 |         28 |
| `echo.exe`     |        169 |       16 |          8 |          9 |
| `exit.exe`     |         40 |        8 |          4 |          3 |
| `hello.exe`    |         40 |        8 |         42 |          3 |
| `help.exe`     |         40 |        8 |        143 |          3 |
| `hostname.exe` |         40 |        8 |         19 |          3 |
| `ls.exe`       |        443 |       48 |        704 |         28 |
| `node.exe`     |        196 |       32 |       2101 |          7 |
| `path.exe`     |        212 |       24 |       4113 |         14 |
| `ping.exe`     |        569 |       64 |        987 |         30 |
| `pwd.exe`      |        103 |       16 |        266 |          8 |
| `set.exe`      |         71 |       16 |         27 |          4 |
| `ver.exe`      |         40 |        8 |         53 |          3 |
| `where.exe`    |        217 |       16 |       4180 |         14 |
| `whoami.exe`   |         40 |        8 |         20 |          3 |
| `whois.exe`    |        376 |       24 |        360 |         25 |

## Simüle DLL image'ları

`.memory.bin`, her process'e map edilen üretilmiş thunk image'ının birebir
kopyasıdır; `.iat.bin` ise DLL guest wrapper ve forwarder import slotlarını
taşır. MZ/PE header veya export directory içermez. `.dis` linked IAT
durumunu, `.asm` IAT tablosunu göstermeden `global` export ve doğrudan
`extern` çağrıları, `.json` ise binding türünü, otomatik syscall numarasını,
ABI imzasını, IAT relocation'larını ve SHA-256 değerini gösterir.
DLL compiler'ı henüz ayrı data section'ları üretmediği için `.rdata`,
`.data` ve `.bss` başlıkları
mevcut artifact'larda açıkça `empty` görünür.

| DLL            | Map edilen .text byte | IAT byte | Export |
| -------------- | --------------------: | -------: | -----: |
| `kernel32.dll` |                102400 |        0 |     99 |
| `ntdll.dll`    |                  4096 |        0 |      1 |
| `msvcrt.dll`   |                 28672 |       72 |     26 |
| `user32.dll`   |                 36864 |        0 |     35 |
| `gdi32.dll`    |                  8192 |        0 |      8 |
| `advapi32.dll` |                  4096 |        0 |      3 |
| `psapi.dll`    |                  4096 |        0 |      1 |
| `ws2_32.dll`   |                 16384 |        0 |     15 |
| `node.dll`     |                  4096 |        0 |      3 |

Toplam 22 executable image, 9 DLL bellek
image'ı ve 191 üretilmiş export bulunuyor.
