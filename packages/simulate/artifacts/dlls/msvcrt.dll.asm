; msvcrt.dll / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export relocation targets.
BITS 64
DEFAULT REL

extern HeapAlloc
extern HeapFree
extern HeapReAlloc
extern CreateFileA
extern CloseHandle
extern ReadFile
extern WriteFile
extern GetStdHandle
extern HeapCreate

global abs
global malloc
global free
global calloc
global realloc
global memcpy
global memset
global memcmp
global strlen
global __getmainargs
global _putenv
global wcslen
global sinf
global cosf
global sqrtf
global sin
global cos
global sqrt
global rand
global fopen
global fclose
global fread
global fwrite
global fflush
global rewind
global printf
global DllMain
global msvcrt_dll_globals

section .text
; bytes=28672; loader chooses the image base and RVA

; export=abs ordinal=0 binding=guest-wrapper
abs:
  mov eax, ecx                               ; linked-va=0x7fe002000000 linked-bytes=8b c1
  cmp eax, -0x80000000                       ; linked-va=0x7fe002000002 linked-bytes=81 f8 00 00 00 80
  jb .loc_0010                               ; linked-va=0x7fe002000008 linked-bytes=0f 82 02 00 00 00
  neg eax                                    ; linked-va=0x7fe00200000e linked-bytes=f7 d8
.loc_0010:
  ret                                        ; linked-va=0x7fe002000010 linked-bytes=c3
  times 1024 - ($ - abs) db 0xcc

; export=malloc ordinal=1 binding=guest-wrapper
malloc:
  mov r10, rcx                               ; linked-va=0x7fe002000400 linked-bytes=4c 8b d1
  mov rcx, msvcrt_dll_globals                ; linked-va=0x7fe002000403 linked-bytes=48 b9 00 f0 ff 02 e0 7f 00 00
  mov rcx, [rcx]                             ; linked-va=0x7fe00200040d linked-bytes=48 8b 09
  xor edx, edx                               ; linked-va=0x7fe002000410 linked-bytes=31 d2
  mov r8, r10                                ; linked-va=0x7fe002000412 linked-bytes=4d 8b c2
  sub rsp, 0x28                              ; linked-va=0x7fe002000415 linked-bytes=48 83 ec 28
  call HeapAlloc                             ; linked-va=0x7fe002000419 linked-bytes=ff 15 e1 6b 00 00
  add rsp, 0x28                              ; linked-va=0x7fe00200041f linked-bytes=48 83 c4 28
  ret                                        ; linked-va=0x7fe002000423 linked-bytes=c3
  times 1024 - ($ - malloc) db 0xcc

; export=free ordinal=2 binding=guest-wrapper
free:
  mov r10, rcx                               ; linked-va=0x7fe002000800 linked-bytes=4c 8b d1
  mov rcx, msvcrt_dll_globals                ; linked-va=0x7fe002000803 linked-bytes=48 b9 00 f0 ff 02 e0 7f 00 00
  mov rcx, [rcx]                             ; linked-va=0x7fe00200080d linked-bytes=48 8b 09
  xor edx, edx                               ; linked-va=0x7fe002000810 linked-bytes=31 d2
  mov r8, r10                                ; linked-va=0x7fe002000812 linked-bytes=4d 8b c2
  sub rsp, 0x28                              ; linked-va=0x7fe002000815 linked-bytes=48 83 ec 28
  call HeapFree                              ; linked-va=0x7fe002000819 linked-bytes=ff 15 e9 67 00 00
  add rsp, 0x28                              ; linked-va=0x7fe00200081f linked-bytes=48 83 c4 28
  ret                                        ; linked-va=0x7fe002000823 linked-bytes=c3
  times 1024 - ($ - free) db 0xcc

; export=calloc ordinal=3 binding=guest-wrapper
calloc:
  mov rax, rcx                               ; linked-va=0x7fe002000c00 linked-bytes=48 8b c1
  mul rdx                                    ; linked-va=0x7fe002000c03 linked-bytes=48 f7 e2
  mov r11, rax                               ; linked-va=0x7fe002000c06 linked-bytes=4c 8b d8
  test rdx, rdx                              ; linked-va=0x7fe002000c09 linked-bytes=48 85 d2
  je near .loc_0015                          ; linked-va=0x7fe002000c0c linked-bytes=0f 84 03 00 00 00
  xor eax, eax                               ; linked-va=0x7fe002000c12 linked-bytes=31 c0
  ret                                        ; linked-va=0x7fe002000c14 linked-bytes=c3
.loc_0015:
  mov rcx, msvcrt_dll_globals                ; linked-va=0x7fe002000c15 linked-bytes=48 b9 00 f0 ff 02 e0 7f 00 00
  mov rcx, [rcx]                             ; linked-va=0x7fe002000c1f linked-bytes=48 8b 09
  mov edx, 0x8                               ; linked-va=0x7fe002000c22 linked-bytes=ba 08 00 00 00
  mov r8, r11                                ; linked-va=0x7fe002000c27 linked-bytes=4d 8b c3
  sub rsp, 0x28                              ; linked-va=0x7fe002000c2a linked-bytes=48 83 ec 28
  call HeapAlloc                             ; linked-va=0x7fe002000c2e linked-bytes=ff 15 cc 63 00 00
  add rsp, 0x28                              ; linked-va=0x7fe002000c34 linked-bytes=48 83 c4 28
  ret                                        ; linked-va=0x7fe002000c38 linked-bytes=c3
  times 1024 - ($ - calloc) db 0xcc

; export=realloc ordinal=4 binding=guest-wrapper
realloc:
  mov r10, rcx                               ; linked-va=0x7fe002001000 linked-bytes=4c 8b d1
  mov r11, rdx                               ; linked-va=0x7fe002001003 linked-bytes=4c 8b da
  test r10, r10                              ; linked-va=0x7fe002001006 linked-bytes=4d 85 d2
  je near .loc_0040                          ; linked-va=0x7fe002001009 linked-bytes=0f 84 31 00 00 00
  test r11, r11                              ; linked-va=0x7fe00200100f linked-bytes=4d 85 db
  je near .loc_0065                          ; linked-va=0x7fe002001012 linked-bytes=0f 84 4d 00 00 00
  mov rcx, msvcrt_dll_globals                ; linked-va=0x7fe002001018 linked-bytes=48 b9 00 f0 ff 02 e0 7f 00 00
  mov rcx, [rcx]                             ; linked-va=0x7fe002001022 linked-bytes=48 8b 09
  xor edx, edx                               ; linked-va=0x7fe002001025 linked-bytes=31 d2
  mov r8, r10                                ; linked-va=0x7fe002001027 linked-bytes=4d 8b c2
  mov r9, r11                                ; linked-va=0x7fe00200102a linked-bytes=4d 8b cb
  sub rsp, 0x28                              ; linked-va=0x7fe00200102d linked-bytes=48 83 ec 28
  call HeapReAlloc                           ; linked-va=0x7fe002001031 linked-bytes=ff 15 d9 5f 00 00
  add rsp, 0x28                              ; linked-va=0x7fe002001037 linked-bytes=48 83 c4 28
  jmp near .loc_0087                         ; linked-va=0x7fe00200103b linked-bytes=e9 47 00 00 00
.loc_0040:
  mov rcx, msvcrt_dll_globals                ; linked-va=0x7fe002001040 linked-bytes=48 b9 00 f0 ff 02 e0 7f 00 00
  mov rcx, [rcx]                             ; linked-va=0x7fe00200104a linked-bytes=48 8b 09
  xor edx, edx                               ; linked-va=0x7fe00200104d linked-bytes=31 d2
  mov r8, r11                                ; linked-va=0x7fe00200104f linked-bytes=4d 8b c3
  sub rsp, 0x28                              ; linked-va=0x7fe002001052 linked-bytes=48 83 ec 28
  call HeapAlloc                             ; linked-va=0x7fe002001056 linked-bytes=ff 15 a4 5f 00 00
  add rsp, 0x28                              ; linked-va=0x7fe00200105c linked-bytes=48 83 c4 28
  jmp near .loc_0087                         ; linked-va=0x7fe002001060 linked-bytes=e9 22 00 00 00
.loc_0065:
  mov rcx, msvcrt_dll_globals                ; linked-va=0x7fe002001065 linked-bytes=48 b9 00 f0 ff 02 e0 7f 00 00
  mov rcx, [rcx]                             ; linked-va=0x7fe00200106f linked-bytes=48 8b 09
  xor edx, edx                               ; linked-va=0x7fe002001072 linked-bytes=31 d2
  mov r8, r10                                ; linked-va=0x7fe002001074 linked-bytes=4d 8b c2
  sub rsp, 0x28                              ; linked-va=0x7fe002001077 linked-bytes=48 83 ec 28
  call HeapFree                              ; linked-va=0x7fe00200107b linked-bytes=ff 15 87 5f 00 00
  add rsp, 0x28                              ; linked-va=0x7fe002001081 linked-bytes=48 83 c4 28
  xor eax, eax                               ; linked-va=0x7fe002001085 linked-bytes=31 c0
.loc_0087:
  ret                                        ; linked-va=0x7fe002001087 linked-bytes=c3
  times 1024 - ($ - realloc) db 0xcc

; export=memcpy ordinal=5 binding=syscall
memcpy:
  mov eax, 0x3005                            ; linked-va=0x7fe002001400 linked-bytes=b8 05 30 00 00
  syscall                                    ; linked-va=0x7fe002001405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe002001407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe002001408 linked-bytes=90
  nop                                        ; linked-va=0x7fe002001409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00200140a linked-bytes=90
  nop                                        ; linked-va=0x7fe00200140b linked-bytes=90
  nop                                        ; linked-va=0x7fe00200140c linked-bytes=90
  nop                                        ; linked-va=0x7fe00200140d linked-bytes=90
  nop                                        ; linked-va=0x7fe00200140e linked-bytes=90
  nop                                        ; linked-va=0x7fe00200140f linked-bytes=90
  times 1024 - ($ - memcpy) db 0xcc

; export=memset ordinal=6 binding=syscall
memset:
  mov eax, 0x3006                            ; linked-va=0x7fe002001800 linked-bytes=b8 06 30 00 00
  syscall                                    ; linked-va=0x7fe002001805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe002001807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe002001808 linked-bytes=90
  nop                                        ; linked-va=0x7fe002001809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00200180a linked-bytes=90
  nop                                        ; linked-va=0x7fe00200180b linked-bytes=90
  nop                                        ; linked-va=0x7fe00200180c linked-bytes=90
  nop                                        ; linked-va=0x7fe00200180d linked-bytes=90
  nop                                        ; linked-va=0x7fe00200180e linked-bytes=90
  nop                                        ; linked-va=0x7fe00200180f linked-bytes=90
  times 1024 - ($ - memset) db 0xcc

; export=memcmp ordinal=7 binding=syscall
memcmp:
  mov eax, 0x3007                            ; linked-va=0x7fe002001c00 linked-bytes=b8 07 30 00 00
  syscall                                    ; linked-va=0x7fe002001c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe002001c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe002001c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe002001c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe002001c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe002001c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe002001c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe002001c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe002001c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe002001c0f linked-bytes=90
  times 1024 - ($ - memcmp) db 0xcc

; export=strlen ordinal=8 binding=syscall
strlen:
  mov eax, 0x3008                            ; linked-va=0x7fe002002000 linked-bytes=b8 08 30 00 00
  syscall                                    ; linked-va=0x7fe002002005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe002002007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe002002008 linked-bytes=90
  nop                                        ; linked-va=0x7fe002002009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00200200a linked-bytes=90
  nop                                        ; linked-va=0x7fe00200200b linked-bytes=90
  nop                                        ; linked-va=0x7fe00200200c linked-bytes=90
  nop                                        ; linked-va=0x7fe00200200d linked-bytes=90
  nop                                        ; linked-va=0x7fe00200200e linked-bytes=90
  nop                                        ; linked-va=0x7fe00200200f linked-bytes=90
  times 1024 - ($ - strlen) db 0xcc

; export=__getmainargs ordinal=9 binding=syscall
__getmainargs:
  mov eax, 0x3009                            ; linked-va=0x7fe002002400 linked-bytes=b8 09 30 00 00
  syscall                                    ; linked-va=0x7fe002002405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe002002407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe002002408 linked-bytes=90
  nop                                        ; linked-va=0x7fe002002409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00200240a linked-bytes=90
  nop                                        ; linked-va=0x7fe00200240b linked-bytes=90
  nop                                        ; linked-va=0x7fe00200240c linked-bytes=90
  nop                                        ; linked-va=0x7fe00200240d linked-bytes=90
  nop                                        ; linked-va=0x7fe00200240e linked-bytes=90
  nop                                        ; linked-va=0x7fe00200240f linked-bytes=90
  times 1024 - ($ - __getmainargs) db 0xcc

; export=_putenv ordinal=10 binding=syscall
_putenv:
  mov eax, 0x300a                            ; linked-va=0x7fe002002800 linked-bytes=b8 0a 30 00 00
  syscall                                    ; linked-va=0x7fe002002805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe002002807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe002002808 linked-bytes=90
  nop                                        ; linked-va=0x7fe002002809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00200280a linked-bytes=90
  nop                                        ; linked-va=0x7fe00200280b linked-bytes=90
  nop                                        ; linked-va=0x7fe00200280c linked-bytes=90
  nop                                        ; linked-va=0x7fe00200280d linked-bytes=90
  nop                                        ; linked-va=0x7fe00200280e linked-bytes=90
  nop                                        ; linked-va=0x7fe00200280f linked-bytes=90
  times 1024 - ($ - _putenv) db 0xcc

; export=wcslen ordinal=11 binding=syscall
wcslen:
  mov eax, 0x300b                            ; linked-va=0x7fe002002c00 linked-bytes=b8 0b 30 00 00
  syscall                                    ; linked-va=0x7fe002002c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe002002c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe002002c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe002002c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe002002c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe002002c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe002002c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe002002c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe002002c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe002002c0f linked-bytes=90
  times 1024 - ($ - wcslen) db 0xcc

; export=sinf ordinal=12 binding=syscall
sinf:
  mov eax, 0x300c                            ; linked-va=0x7fe002003000 linked-bytes=b8 0c 30 00 00
  syscall                                    ; linked-va=0x7fe002003005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe002003007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe002003008 linked-bytes=90
  nop                                        ; linked-va=0x7fe002003009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00200300a linked-bytes=90
  nop                                        ; linked-va=0x7fe00200300b linked-bytes=90
  nop                                        ; linked-va=0x7fe00200300c linked-bytes=90
  nop                                        ; linked-va=0x7fe00200300d linked-bytes=90
  nop                                        ; linked-va=0x7fe00200300e linked-bytes=90
  nop                                        ; linked-va=0x7fe00200300f linked-bytes=90
  times 1024 - ($ - sinf) db 0xcc

; export=cosf ordinal=13 binding=syscall
cosf:
  mov eax, 0x300d                            ; linked-va=0x7fe002003400 linked-bytes=b8 0d 30 00 00
  syscall                                    ; linked-va=0x7fe002003405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe002003407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe002003408 linked-bytes=90
  nop                                        ; linked-va=0x7fe002003409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00200340a linked-bytes=90
  nop                                        ; linked-va=0x7fe00200340b linked-bytes=90
  nop                                        ; linked-va=0x7fe00200340c linked-bytes=90
  nop                                        ; linked-va=0x7fe00200340d linked-bytes=90
  nop                                        ; linked-va=0x7fe00200340e linked-bytes=90
  nop                                        ; linked-va=0x7fe00200340f linked-bytes=90
  times 1024 - ($ - cosf) db 0xcc

; export=sqrtf ordinal=14 binding=syscall
sqrtf:
  mov eax, 0x300e                            ; linked-va=0x7fe002003800 linked-bytes=b8 0e 30 00 00
  syscall                                    ; linked-va=0x7fe002003805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe002003807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe002003808 linked-bytes=90
  nop                                        ; linked-va=0x7fe002003809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00200380a linked-bytes=90
  nop                                        ; linked-va=0x7fe00200380b linked-bytes=90
  nop                                        ; linked-va=0x7fe00200380c linked-bytes=90
  nop                                        ; linked-va=0x7fe00200380d linked-bytes=90
  nop                                        ; linked-va=0x7fe00200380e linked-bytes=90
  nop                                        ; linked-va=0x7fe00200380f linked-bytes=90
  times 1024 - ($ - sqrtf) db 0xcc

; export=sin ordinal=15 binding=syscall
sin:
  mov eax, 0x300f                            ; linked-va=0x7fe002003c00 linked-bytes=b8 0f 30 00 00
  syscall                                    ; linked-va=0x7fe002003c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe002003c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe002003c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe002003c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe002003c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe002003c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe002003c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe002003c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe002003c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe002003c0f linked-bytes=90
  times 1024 - ($ - sin) db 0xcc

; export=cos ordinal=16 binding=syscall
cos:
  mov eax, 0x3010                            ; linked-va=0x7fe002004000 linked-bytes=b8 10 30 00 00
  syscall                                    ; linked-va=0x7fe002004005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe002004007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe002004008 linked-bytes=90
  nop                                        ; linked-va=0x7fe002004009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00200400a linked-bytes=90
  nop                                        ; linked-va=0x7fe00200400b linked-bytes=90
  nop                                        ; linked-va=0x7fe00200400c linked-bytes=90
  nop                                        ; linked-va=0x7fe00200400d linked-bytes=90
  nop                                        ; linked-va=0x7fe00200400e linked-bytes=90
  nop                                        ; linked-va=0x7fe00200400f linked-bytes=90
  times 1024 - ($ - cos) db 0xcc

; export=sqrt ordinal=17 binding=syscall
sqrt:
  mov eax, 0x3011                            ; linked-va=0x7fe002004400 linked-bytes=b8 11 30 00 00
  syscall                                    ; linked-va=0x7fe002004405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe002004407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe002004408 linked-bytes=90
  nop                                        ; linked-va=0x7fe002004409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00200440a linked-bytes=90
  nop                                        ; linked-va=0x7fe00200440b linked-bytes=90
  nop                                        ; linked-va=0x7fe00200440c linked-bytes=90
  nop                                        ; linked-va=0x7fe00200440d linked-bytes=90
  nop                                        ; linked-va=0x7fe00200440e linked-bytes=90
  nop                                        ; linked-va=0x7fe00200440f linked-bytes=90
  times 1024 - ($ - sqrt) db 0xcc

; export=rand ordinal=18 binding=syscall
rand:
  mov eax, 0x3012                            ; linked-va=0x7fe002004800 linked-bytes=b8 12 30 00 00
  syscall                                    ; linked-va=0x7fe002004805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe002004807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe002004808 linked-bytes=90
  nop                                        ; linked-va=0x7fe002004809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00200480a linked-bytes=90
  nop                                        ; linked-va=0x7fe00200480b linked-bytes=90
  nop                                        ; linked-va=0x7fe00200480c linked-bytes=90
  nop                                        ; linked-va=0x7fe00200480d linked-bytes=90
  nop                                        ; linked-va=0x7fe00200480e linked-bytes=90
  nop                                        ; linked-va=0x7fe00200480f linked-bytes=90
  times 1024 - ($ - rand) db 0xcc

; export=fopen ordinal=19 binding=guest-wrapper
fopen:
  mov r10, rcx                               ; linked-va=0x7fe002004c00 linked-bytes=4c 8b d1
  mov r9, rdx                                ; linked-va=0x7fe002004c03 linked-bytes=4c 8b ca
  movzx eax, byte [r9]                       ; linked-va=0x7fe002004c06 linked-bytes=41 0f b6 01
  cmp eax, 0x72                              ; linked-va=0x7fe002004c0a linked-bytes=83 f8 72
  je near .loc_002a                          ; linked-va=0x7fe002004c0d linked-bytes=0f 84 17 00 00 00
  cmp eax, 0x77                              ; linked-va=0x7fe002004c13 linked-bytes=83 f8 77
  je near .loc_0031                          ; linked-va=0x7fe002004c16 linked-bytes=0f 84 15 00 00 00
  cmp eax, 0x61                              ; linked-va=0x7fe002004c1c linked-bytes=83 f8 61
  je near .loc_003b                          ; linked-va=0x7fe002004c1f linked-bytes=0f 84 16 00 00 00
  jmp near .loc_0178                         ; linked-va=0x7fe002004c25 linked-bytes=e9 4e 01 00 00
.loc_002a:
  xor edx, edx                               ; linked-va=0x7fe002004c2a linked-bytes=31 d2
  jmp near .loc_0040                         ; linked-va=0x7fe002004c2c linked-bytes=e9 0f 00 00 00
.loc_0031:
  mov edx, 0x1                               ; linked-va=0x7fe002004c31 linked-bytes=ba 01 00 00 00
  jmp near .loc_0040                         ; linked-va=0x7fe002004c36 linked-bytes=e9 05 00 00 00
.loc_003b:
  mov edx, 0x2                               ; linked-va=0x7fe002004c3b linked-bytes=ba 02 00 00 00
.loc_0040:
  xor r8d, r8d                               ; linked-va=0x7fe002004c40 linked-bytes=45 31 c0
  xor r11d, r11d                             ; linked-va=0x7fe002004c43 linked-bytes=45 31 db
  add r9, 0x1                                ; linked-va=0x7fe002004c46 linked-bytes=49 83 c1 01
.loc_004a:
  movzx eax, byte [r9]                       ; linked-va=0x7fe002004c4a linked-bytes=41 0f b6 01
  test eax, eax                              ; linked-va=0x7fe002004c4e linked-bytes=85 c0
  je near .loc_0099                          ; linked-va=0x7fe002004c50 linked-bytes=0f 84 43 00 00 00
  cmp eax, 0x2b                              ; linked-va=0x7fe002004c56 linked-bytes=83 f8 2b
  je near .loc_007f                          ; linked-va=0x7fe002004c59 linked-bytes=0f 84 20 00 00 00
  cmp eax, 0x62                              ; linked-va=0x7fe002004c5f linked-bytes=83 f8 62
  je near .loc_0090                          ; linked-va=0x7fe002004c62 linked-bytes=0f 84 28 00 00 00
  cmp eax, 0x74                              ; linked-va=0x7fe002004c68 linked-bytes=83 f8 74
  je near .loc_0090                          ; linked-va=0x7fe002004c6b linked-bytes=0f 84 1f 00 00 00
  cmp eax, 0x78                              ; linked-va=0x7fe002004c71 linked-bytes=83 f8 78
  je near .loc_008a                          ; linked-va=0x7fe002004c74 linked-bytes=0f 84 10 00 00 00
  jmp near .loc_0178                         ; linked-va=0x7fe002004c7a linked-bytes=e9 f9 00 00 00
.loc_007f:
  mov r8d, 0x1                               ; linked-va=0x7fe002004c7f linked-bytes=41 b8 01 00 00 00
  jmp near .loc_0090                         ; linked-va=0x7fe002004c85 linked-bytes=e9 06 00 00 00
.loc_008a:
  mov r11d, 0x1                              ; linked-va=0x7fe002004c8a linked-bytes=41 bb 01 00 00 00
.loc_0090:
  add r9, 0x1                                ; linked-va=0x7fe002004c90 linked-bytes=49 83 c1 01
  jmp near .loc_004a                         ; linked-va=0x7fe002004c94 linked-bytes=e9 b1 ff ff ff
.loc_0099:
  cmp edx, 0x0                               ; linked-va=0x7fe002004c99 linked-bytes=83 fa 00
  je near .loc_00b0                          ; linked-va=0x7fe002004c9c linked-bytes=0f 84 0e 00 00 00
  cmp edx, 0x1                               ; linked-va=0x7fe002004ca2 linked-bytes=83 fa 01
  je near .loc_00e4                          ; linked-va=0x7fe002004ca5 linked-bytes=0f 84 39 00 00 00
  jmp near .loc_0123                         ; linked-va=0x7fe002004cab linked-bytes=e9 73 00 00 00
.loc_00b0:
  cmp r11d, 0x0                              ; linked-va=0x7fe002004cb0 linked-bytes=41 83 fb 00
  jne near .loc_0178                         ; linked-va=0x7fe002004cb4 linked-bytes=0f 85 be 00 00 00
  cmp r8d, 0x0                               ; linked-va=0x7fe002004cba linked-bytes=41 83 f8 00
  je near .loc_00ce                          ; linked-va=0x7fe002004cbe linked-bytes=0f 84 0a 00 00 00
  mov edx, 0xc0000000                        ; linked-va=0x7fe002004cc4 linked-bytes=ba 00 00 00 c0
  jmp near .loc_00d3                         ; linked-va=0x7fe002004cc9 linked-bytes=e9 05 00 00 00
.loc_00ce:
  mov edx, 0x80000000                        ; linked-va=0x7fe002004cce linked-bytes=ba 00 00 00 80
.loc_00d3:
  mov r8d, 0x1                               ; linked-va=0x7fe002004cd3 linked-bytes=41 b8 01 00 00 00
  mov r11d, 0x3                              ; linked-va=0x7fe002004cd9 linked-bytes=41 bb 03 00 00 00
  jmp near .loc_0152                         ; linked-va=0x7fe002004cdf linked-bytes=e9 6e 00 00 00
.loc_00e4:
  cmp r8d, 0x0                               ; linked-va=0x7fe002004ce4 linked-bytes=41 83 f8 00
  je near .loc_00f8                          ; linked-va=0x7fe002004ce8 linked-bytes=0f 84 0a 00 00 00
  mov edx, 0xc0000000                        ; linked-va=0x7fe002004cee linked-bytes=ba 00 00 00 c0
  jmp near .loc_00fd                         ; linked-va=0x7fe002004cf3 linked-bytes=e9 05 00 00 00
.loc_00f8:
  mov edx, 0x40000000                        ; linked-va=0x7fe002004cf8 linked-bytes=ba 00 00 00 40
.loc_00fd:
  mov r8d, 0x0                               ; linked-va=0x7fe002004cfd linked-bytes=41 b8 00 00 00 00
  cmp r11d, 0x0                              ; linked-va=0x7fe002004d03 linked-bytes=41 83 fb 00
  je near .loc_0118                          ; linked-va=0x7fe002004d07 linked-bytes=0f 84 0b 00 00 00
  mov r11d, 0x1                              ; linked-va=0x7fe002004d0d linked-bytes=41 bb 01 00 00 00
  jmp near .loc_0152                         ; linked-va=0x7fe002004d13 linked-bytes=e9 3a 00 00 00
.loc_0118:
  mov r11d, 0x2                              ; linked-va=0x7fe002004d18 linked-bytes=41 bb 02 00 00 00
  jmp near .loc_0152                         ; linked-va=0x7fe002004d1e linked-bytes=e9 2f 00 00 00
.loc_0123:
  cmp r11d, 0x0                              ; linked-va=0x7fe002004d23 linked-bytes=41 83 fb 00
  jne near .loc_0178                         ; linked-va=0x7fe002004d27 linked-bytes=0f 85 4b 00 00 00
  cmp r8d, 0x0                               ; linked-va=0x7fe002004d2d linked-bytes=41 83 f8 00
  je near .loc_0141                          ; linked-va=0x7fe002004d31 linked-bytes=0f 84 0a 00 00 00
  mov edx, 0xc0000004                        ; linked-va=0x7fe002004d37 linked-bytes=ba 04 00 00 c0
  jmp near .loc_0146                         ; linked-va=0x7fe002004d3c linked-bytes=e9 05 00 00 00
.loc_0141:
  mov edx, 0x40000004                        ; linked-va=0x7fe002004d41 linked-bytes=ba 04 00 00 40
.loc_0146:
  mov r8d, 0x1                               ; linked-va=0x7fe002004d46 linked-bytes=41 b8 01 00 00 00
  mov r11d, 0x4                              ; linked-va=0x7fe002004d4c linked-bytes=41 bb 04 00 00 00
.loc_0152:
  mov rcx, r10                               ; linked-va=0x7fe002004d52 linked-bytes=49 8b ca
  xor r9, r9                                 ; linked-va=0x7fe002004d55 linked-bytes=4d 31 c9
  push 0x0                                   ; linked-va=0x7fe002004d58 linked-bytes=6a 00
  push 0x80                                  ; linked-va=0x7fe002004d5a linked-bytes=68 80 00 00 00
  push r11                                   ; linked-va=0x7fe002004d5f linked-bytes=41 53
  sub rsp, 0x20                              ; linked-va=0x7fe002004d61 linked-bytes=48 83 ec 20
  call CreateFileA                           ; linked-va=0x7fe002004d65 linked-bytes=ff 15 ad 22 00 00
  add rsp, 0x38                              ; linked-va=0x7fe002004d6b linked-bytes=48 83 c4 38
  cmp rax, -0x1                              ; linked-va=0x7fe002004d6f linked-bytes=48 83 f8 ff
  jne short .loc_0177                        ; linked-va=0x7fe002004d73 linked-bytes=75 02
  xor eax, eax                               ; linked-va=0x7fe002004d75 linked-bytes=31 c0
.loc_0177:
  ret                                        ; linked-va=0x7fe002004d77 linked-bytes=c3
.loc_0178:
  xor eax, eax                               ; linked-va=0x7fe002004d78 linked-bytes=31 c0
  ret                                        ; linked-va=0x7fe002004d7a linked-bytes=c3
  times 1024 - ($ - fopen) db 0xcc

; export=fclose ordinal=20 binding=forwarder
fclose:
  jmp CloseHandle                            ; linked-va=0x7fe002005000 linked-bytes=ff 25 1a 20 00 00
  times 1024 - ($ - fclose) db 0xcc

; export=fread ordinal=21 binding=guest-wrapper
fread:
  push rbp                                   ; linked-va=0x7fe002005400 linked-bytes=55
  mov rbp, rsp                               ; linked-va=0x7fe002005401 linked-bytes=48 8b ec
  push r12                                   ; linked-va=0x7fe002005404 linked-bytes=41 54
  push r13                                   ; linked-va=0x7fe002005406 linked-bytes=41 55
  push r14                                   ; linked-va=0x7fe002005408 linked-bytes=41 56
  sub rsp, 0x20                              ; linked-va=0x7fe00200540a linked-bytes=48 83 ec 20
  mov r12, rcx                               ; linked-va=0x7fe00200540e linked-bytes=4c 8b e1
  mov r13, rdx                               ; linked-va=0x7fe002005411 linked-bytes=4c 8b ea
  mov r14, r9                                ; linked-va=0x7fe002005414 linked-bytes=4d 8b f1
  test r13, r13                              ; linked-va=0x7fe002005417 linked-bytes=4d 85 ed
  je near .loc_0083                          ; linked-va=0x7fe00200541a linked-bytes=0f 84 63 00 00 00
  test r8, r8                                ; linked-va=0x7fe002005420 linked-bytes=4d 85 c0
  je near .loc_0083                          ; linked-va=0x7fe002005423 linked-bytes=0f 84 5a 00 00 00
  mov rax, r13                               ; linked-va=0x7fe002005429 linked-bytes=49 8b c5
  mul r8                                     ; linked-va=0x7fe00200542c linked-bytes=49 f7 e0
  test rdx, rdx                              ; linked-va=0x7fe00200542f linked-bytes=48 85 d2
  jne near .loc_0083                         ; linked-va=0x7fe002005432 linked-bytes=0f 85 4b 00 00 00
  mov r10, rax                               ; linked-va=0x7fe002005438 linked-bytes=4c 8b d0
  mov r11, 0xffffffff                        ; linked-va=0x7fe00200543b linked-bytes=49 bb ff ff ff ff 00 00 00 00
  and r10, r11                               ; linked-va=0x7fe002005445 linked-bytes=4d 21 da
  cmp r10, rax                               ; linked-va=0x7fe002005448 linked-bytes=49 39 c2
  jne near .loc_0083                         ; linked-va=0x7fe00200544b linked-bytes=0f 85 32 00 00 00
  mov rcx, r14                               ; linked-va=0x7fe002005451 linked-bytes=49 8b ce
  mov rdx, r12                               ; linked-va=0x7fe002005454 linked-bytes=49 8b d4
  mov r8, rax                                ; linked-va=0x7fe002005457 linked-bytes=4c 8b c0
  lea r9, [rbp-0x20]                         ; linked-va=0x7fe00200545a linked-bytes=4c 8d 4d e0
  push 0x0                                   ; linked-va=0x7fe00200545e linked-bytes=6a 00
  sub rsp, 0x20                              ; linked-va=0x7fe002005460 linked-bytes=48 83 ec 20
  call ReadFile                              ; linked-va=0x7fe002005464 linked-bytes=ff 15 be 1b 00 00
  add rsp, 0x28                              ; linked-va=0x7fe00200546a linked-bytes=48 83 c4 28
  test eax, eax                              ; linked-va=0x7fe00200546e linked-bytes=85 c0
  je near .loc_0083                          ; linked-va=0x7fe002005470 linked-bytes=0f 84 0d 00 00 00
  mov eax, [rbp-0x20]                        ; linked-va=0x7fe002005476 linked-bytes=8b 45 e0
  xor edx, edx                               ; linked-va=0x7fe002005479 linked-bytes=31 d2
  div r13                                    ; linked-va=0x7fe00200547b linked-bytes=49 f7 f5
  jmp near .loc_0085                         ; linked-va=0x7fe00200547e linked-bytes=e9 02 00 00 00
.loc_0083:
  xor eax, eax                               ; linked-va=0x7fe002005483 linked-bytes=31 c0
.loc_0085:
  add rsp, 0x20                              ; linked-va=0x7fe002005485 linked-bytes=48 83 c4 20
  pop r14                                    ; linked-va=0x7fe002005489 linked-bytes=41 5e
  pop r13                                    ; linked-va=0x7fe00200548b linked-bytes=41 5d
  pop r12                                    ; linked-va=0x7fe00200548d linked-bytes=41 5c
  pop rbp                                    ; linked-va=0x7fe00200548f linked-bytes=5d
  ret                                        ; linked-va=0x7fe002005490 linked-bytes=c3
  times 1024 - ($ - fread) db 0xcc

; export=fwrite ordinal=22 binding=guest-wrapper
fwrite:
  push rbp                                   ; linked-va=0x7fe002005800 linked-bytes=55
  mov rbp, rsp                               ; linked-va=0x7fe002005801 linked-bytes=48 8b ec
  push r12                                   ; linked-va=0x7fe002005804 linked-bytes=41 54
  push r13                                   ; linked-va=0x7fe002005806 linked-bytes=41 55
  push r14                                   ; linked-va=0x7fe002005808 linked-bytes=41 56
  sub rsp, 0x20                              ; linked-va=0x7fe00200580a linked-bytes=48 83 ec 20
  mov r12, rcx                               ; linked-va=0x7fe00200580e linked-bytes=4c 8b e1
  mov r13, rdx                               ; linked-va=0x7fe002005811 linked-bytes=4c 8b ea
  mov r14, r9                                ; linked-va=0x7fe002005814 linked-bytes=4d 8b f1
  test r13, r13                              ; linked-va=0x7fe002005817 linked-bytes=4d 85 ed
  je near .loc_0083                          ; linked-va=0x7fe00200581a linked-bytes=0f 84 63 00 00 00
  test r8, r8                                ; linked-va=0x7fe002005820 linked-bytes=4d 85 c0
  je near .loc_0083                          ; linked-va=0x7fe002005823 linked-bytes=0f 84 5a 00 00 00
  mov rax, r13                               ; linked-va=0x7fe002005829 linked-bytes=49 8b c5
  mul r8                                     ; linked-va=0x7fe00200582c linked-bytes=49 f7 e0
  test rdx, rdx                              ; linked-va=0x7fe00200582f linked-bytes=48 85 d2
  jne near .loc_0083                         ; linked-va=0x7fe002005832 linked-bytes=0f 85 4b 00 00 00
  mov r10, rax                               ; linked-va=0x7fe002005838 linked-bytes=4c 8b d0
  mov r11, 0xffffffff                        ; linked-va=0x7fe00200583b linked-bytes=49 bb ff ff ff ff 00 00 00 00
  and r10, r11                               ; linked-va=0x7fe002005845 linked-bytes=4d 21 da
  cmp r10, rax                               ; linked-va=0x7fe002005848 linked-bytes=49 39 c2
  jne near .loc_0083                         ; linked-va=0x7fe00200584b linked-bytes=0f 85 32 00 00 00
  mov rcx, r14                               ; linked-va=0x7fe002005851 linked-bytes=49 8b ce
  mov rdx, r12                               ; linked-va=0x7fe002005854 linked-bytes=49 8b d4
  mov r8, rax                                ; linked-va=0x7fe002005857 linked-bytes=4c 8b c0
  lea r9, [rbp-0x20]                         ; linked-va=0x7fe00200585a linked-bytes=4c 8d 4d e0
  push 0x0                                   ; linked-va=0x7fe00200585e linked-bytes=6a 00
  sub rsp, 0x20                              ; linked-va=0x7fe002005860 linked-bytes=48 83 ec 20
  call WriteFile                             ; linked-va=0x7fe002005864 linked-bytes=ff 15 c6 17 00 00
  add rsp, 0x28                              ; linked-va=0x7fe00200586a linked-bytes=48 83 c4 28
  test eax, eax                              ; linked-va=0x7fe00200586e linked-bytes=85 c0
  je near .loc_0083                          ; linked-va=0x7fe002005870 linked-bytes=0f 84 0d 00 00 00
  mov eax, [rbp-0x20]                        ; linked-va=0x7fe002005876 linked-bytes=8b 45 e0
  xor edx, edx                               ; linked-va=0x7fe002005879 linked-bytes=31 d2
  div r13                                    ; linked-va=0x7fe00200587b linked-bytes=49 f7 f5
  jmp near .loc_0085                         ; linked-va=0x7fe00200587e linked-bytes=e9 02 00 00 00
.loc_0083:
  xor eax, eax                               ; linked-va=0x7fe002005883 linked-bytes=31 c0
.loc_0085:
  add rsp, 0x20                              ; linked-va=0x7fe002005885 linked-bytes=48 83 c4 20
  pop r14                                    ; linked-va=0x7fe002005889 linked-bytes=41 5e
  pop r13                                    ; linked-va=0x7fe00200588b linked-bytes=41 5d
  pop r12                                    ; linked-va=0x7fe00200588d linked-bytes=41 5c
  pop rbp                                    ; linked-va=0x7fe00200588f linked-bytes=5d
  ret                                        ; linked-va=0x7fe002005890 linked-bytes=c3
  times 1024 - ($ - fwrite) db 0xcc

; export=fflush ordinal=23 binding=syscall
fflush:
  mov eax, 0x3017                            ; linked-va=0x7fe002005c00 linked-bytes=b8 17 30 00 00
  syscall                                    ; linked-va=0x7fe002005c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe002005c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe002005c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe002005c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe002005c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe002005c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe002005c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe002005c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe002005c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe002005c0f linked-bytes=90
  times 1024 - ($ - fflush) db 0xcc

; export=rewind ordinal=24 binding=syscall
rewind:
  mov eax, 0x3018                            ; linked-va=0x7fe002006000 linked-bytes=b8 18 30 00 00
  syscall                                    ; linked-va=0x7fe002006005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe002006007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe002006008 linked-bytes=90
  nop                                        ; linked-va=0x7fe002006009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00200600a linked-bytes=90
  nop                                        ; linked-va=0x7fe00200600b linked-bytes=90
  nop                                        ; linked-va=0x7fe00200600c linked-bytes=90
  nop                                        ; linked-va=0x7fe00200600d linked-bytes=90
  nop                                        ; linked-va=0x7fe00200600e linked-bytes=90
  nop                                        ; linked-va=0x7fe00200600f linked-bytes=90
  times 1024 - ($ - rewind) db 0xcc

; export=printf ordinal=25 binding=guest-wrapper
printf:
  push rbp                                   ; linked-va=0x7fe002006400 linked-bytes=55
  mov rbp, rsp                               ; linked-va=0x7fe002006401 linked-bytes=48 8b ec
  push rbx                                   ; linked-va=0x7fe002006404 linked-bytes=53
  push rsi                                   ; linked-va=0x7fe002006405 linked-bytes=56
  push rdi                                   ; linked-va=0x7fe002006406 linked-bytes=57
  push r12                                   ; linked-va=0x7fe002006407 linked-bytes=41 54
  push r13                                   ; linked-va=0x7fe002006409 linked-bytes=41 55
  push r14                                   ; linked-va=0x7fe00200640b linked-bytes=41 56
  push r15                                   ; linked-va=0x7fe00200640d linked-bytes=41 57
  sub rsp, 0x88                              ; linked-va=0x7fe00200640f linked-bytes=48 81 ec 88 00 00 00
  mov r12, rcx                               ; linked-va=0x7fe002006416 linked-bytes=4c 8b e1
  mov r13, rdx                               ; linked-va=0x7fe002006419 linked-bytes=4c 8b ea
  mov r14, r8                                ; linked-va=0x7fe00200641c linked-bytes=4d 8b f0
  mov r15, r9                                ; linked-va=0x7fe00200641f linked-bytes=4d 8b f9
  xor ebx, ebx                               ; linked-va=0x7fe002006422 linked-bytes=31 db
  xor esi, esi                               ; linked-va=0x7fe002006424 linked-bytes=31 f6
  mov [rbp-0x48], 0x2d                       ; linked-va=0x7fe002006426 linked-bytes=48 c7 45 b8 2d 00 00 00
.loc_002e:
  movzx eax, byte [r12]                      ; linked-va=0x7fe00200642e linked-bytes=41 0f b6 04 24
  test eax, eax                              ; linked-va=0x7fe002006433 linked-bytes=85 c0
  je near .loc_0209                          ; linked-va=0x7fe002006435 linked-bytes=0f 84 ce 01 00 00
  cmp eax, 0x25                              ; linked-va=0x7fe00200643b linked-bytes=83 f8 25
  je near .loc_0087                          ; linked-va=0x7fe00200643e linked-bytes=0f 84 43 00 00 00
  mov rdi, r12                               ; linked-va=0x7fe002006444 linked-bytes=49 8b fc
  xor r8d, r8d                               ; linked-va=0x7fe002006447 linked-bytes=45 31 c0
.loc_004a:
  movzx eax, byte [r12]                      ; linked-va=0x7fe00200644a linked-bytes=41 0f b6 04 24
  test eax, eax                              ; linked-va=0x7fe00200644f linked-bytes=85 c0
  je near .loc_007a                          ; linked-va=0x7fe002006451 linked-bytes=0f 84 23 00 00 00
  cmp eax, 0x25                              ; linked-va=0x7fe002006457 linked-bytes=83 f8 25
  je near .loc_006d                          ; linked-va=0x7fe00200645a linked-bytes=0f 84 0d 00 00 00
  add r12, 0x1                               ; linked-va=0x7fe002006460 linked-bytes=49 83 c4 01
  add r8, 0x1                                ; linked-va=0x7fe002006464 linked-bytes=49 83 c0 01
  jmp near .loc_004a                         ; linked-va=0x7fe002006468 linked-bytes=e9 dd ff ff ff
.loc_006d:
  mov rdx, rdi                               ; linked-va=0x7fe00200646d linked-bytes=48 8b d7
  call .loc_0258                             ; linked-va=0x7fe002006470 linked-bytes=e8 e3 01 00 00
  jmp near .loc_002e                         ; linked-va=0x7fe002006475 linked-bytes=e9 b4 ff ff ff
.loc_007a:
  mov rdx, rdi                               ; linked-va=0x7fe00200647a linked-bytes=48 8b d7
  call .loc_0258                             ; linked-va=0x7fe00200647d linked-bytes=e8 d6 01 00 00
  jmp near .loc_0209                         ; linked-va=0x7fe002006482 linked-bytes=e9 82 01 00 00
.loc_0087:
  add r12, 0x1                               ; linked-va=0x7fe002006487 linked-bytes=49 83 c4 01
  movzx eax, byte [r12]                      ; linked-va=0x7fe00200648b linked-bytes=41 0f b6 04 24
  test eax, eax                              ; linked-va=0x7fe002006490 linked-bytes=85 c0
  je near .loc_01e7                          ; linked-va=0x7fe002006492 linked-bytes=0f 84 4f 01 00 00
  cmp eax, 0x73                              ; linked-va=0x7fe002006498 linked-bytes=83 f8 73
  je near .loc_00b8                          ; linked-va=0x7fe00200649b linked-bytes=0f 84 17 00 00 00
  cmp eax, 0x64                              ; linked-va=0x7fe0020064a1 linked-bytes=83 f8 64
  je near .loc_00ee                          ; linked-va=0x7fe0020064a4 linked-bytes=0f 84 44 00 00 00
  cmp eax, 0x25                              ; linked-va=0x7fe0020064aa linked-bytes=83 f8 25
  je near .loc_01a5                          ; linked-va=0x7fe0020064ad linked-bytes=0f 84 f2 00 00 00
  jmp near .loc_01bc                         ; linked-va=0x7fe0020064b3 linked-bytes=e9 04 01 00 00
.loc_00b8:
  call .loc_021f                             ; linked-va=0x7fe0020064b8 linked-bytes=e8 62 01 00 00
  test rdx, rdx                              ; linked-va=0x7fe0020064bd linked-bytes=48 85 d2
  je near .loc_0200                          ; linked-va=0x7fe0020064c0 linked-bytes=0f 84 3a 01 00 00
  mov rdi, rdx                               ; linked-va=0x7fe0020064c6 linked-bytes=48 8b fa
  xor r8d, r8d                               ; linked-va=0x7fe0020064c9 linked-bytes=45 31 c0
.loc_00cc:
  movzx eax, byte [rdi]                      ; linked-va=0x7fe0020064cc linked-bytes=0f b6 07
  test eax, eax                              ; linked-va=0x7fe0020064cf linked-bytes=85 c0
  je near .loc_00e4                          ; linked-va=0x7fe0020064d1 linked-bytes=0f 84 0d 00 00 00
  add rdi, 0x1                               ; linked-va=0x7fe0020064d7 linked-bytes=48 83 c7 01
  add r8, 0x1                                ; linked-va=0x7fe0020064db linked-bytes=49 83 c0 01
  jmp near .loc_00cc                         ; linked-va=0x7fe0020064df linked-bytes=e9 e8 ff ff ff
.loc_00e4:
  call .loc_0258                             ; linked-va=0x7fe0020064e4 linked-bytes=e8 6f 01 00 00
  jmp near .loc_0200                         ; linked-va=0x7fe0020064e9 linked-bytes=e9 12 01 00 00
.loc_00ee:
  call .loc_021f                             ; linked-va=0x7fe0020064ee linked-bytes=e8 2c 01 00 00
  mov [rbp-0x50], rdx                        ; linked-va=0x7fe0020064f3 linked-bytes=48 89 55 b0
  mov eax, edx                               ; linked-va=0x7fe0020064f7 linked-bytes=8b c2
  mov ecx, 0x80000000                        ; linked-va=0x7fe0020064f9 linked-bytes=b9 00 00 00 80
  test eax, ecx                              ; linked-va=0x7fe0020064fe linked-bytes=85 c8
  je near .loc_0123                          ; linked-va=0x7fe002006500 linked-bytes=0f 84 1d 00 00 00
  lea rdx, [rbp-0x48]                        ; linked-va=0x7fe002006506 linked-bytes=48 8d 55 b8
  mov r8, 0x1                                ; linked-va=0x7fe00200650a linked-bytes=49 b8 01 00 00 00 00 00 00 00
  call .loc_0258                             ; linked-va=0x7fe002006514 linked-bytes=e8 3f 01 00 00
  mov eax, [rbp-0x50]                        ; linked-va=0x7fe002006519 linked-bytes=8b 45 b0
  neg eax                                    ; linked-va=0x7fe00200651c linked-bytes=f7 d8
  jmp near .loc_0126                         ; linked-va=0x7fe00200651e linked-bytes=e9 03 00 00 00
.loc_0123:
  mov eax, [rbp-0x50]                        ; linked-va=0x7fe002006523 linked-bytes=8b 45 b0
.loc_0126:
  lea rdi, [rbp-0xc0]                        ; linked-va=0x7fe002006526 linked-bytes=48 8d bd 40 ff ff ff
  mov [rbp-0x58], 0x0                        ; linked-va=0x7fe00200652d linked-bytes=48 c7 45 a8 00 00 00 00
  test eax, eax                              ; linked-va=0x7fe002006535 linked-bytes=85 c0
  jne near .loc_0155                         ; linked-va=0x7fe002006537 linked-bytes=0f 85 18 00 00 00
  mov [rdi], 0x30                            ; linked-va=0x7fe00200653d linked-bytes=48 c7 07 30 00 00 00
  add rdi, 0x8                               ; linked-va=0x7fe002006544 linked-bytes=48 83 c7 08
  mov [rbp-0x58], 0x1                        ; linked-va=0x7fe002006548 linked-bytes=48 c7 45 a8 01 00 00 00
  jmp near .loc_0175                         ; linked-va=0x7fe002006550 linked-bytes=e9 20 00 00 00
.loc_0155:
  xor edx, edx                               ; linked-va=0x7fe002006555 linked-bytes=31 d2
  mov ecx, 0xa                               ; linked-va=0x7fe002006557 linked-bytes=b9 0a 00 00 00
  div ecx                                    ; linked-va=0x7fe00200655c linked-bytes=f7 f1
  add edx, 0x30                              ; linked-va=0x7fe00200655e linked-bytes=83 c2 30
  mov [rdi], rdx                             ; linked-va=0x7fe002006561 linked-bytes=48 89 17
  add rdi, 0x8                               ; linked-va=0x7fe002006564 linked-bytes=48 83 c7 08
  add [rbp-0x58], 0x1                        ; linked-va=0x7fe002006568 linked-bytes=48 83 45 a8 01
  test eax, eax                              ; linked-va=0x7fe00200656d linked-bytes=85 c0
  jne near .loc_0155                         ; linked-va=0x7fe00200656f linked-bytes=0f 85 e0 ff ff ff
.loc_0175:
  cmp [rbp-0x58], 0x0                        ; linked-va=0x7fe002006575 linked-bytes=48 83 7d a8 00
  jne near .loc_0185                         ; linked-va=0x7fe00200657a linked-bytes=0f 85 05 00 00 00
  jmp near .loc_0200                         ; linked-va=0x7fe002006580 linked-bytes=e9 7b 00 00 00
.loc_0185:
  sub rdi, 0x8                               ; linked-va=0x7fe002006585 linked-bytes=48 83 ef 08
  mov rdx, rdi                               ; linked-va=0x7fe002006589 linked-bytes=48 8b d7
  mov r8, 0x1                                ; linked-va=0x7fe00200658c linked-bytes=49 b8 01 00 00 00 00 00 00 00
  call .loc_0258                             ; linked-va=0x7fe002006596 linked-bytes=e8 bd 00 00 00
  sub [rbp-0x58], 0x1                        ; linked-va=0x7fe00200659b linked-bytes=48 83 6d a8 01
  jmp near .loc_0175                         ; linked-va=0x7fe0020065a0 linked-bytes=e9 d0 ff ff ff
.loc_01a5:
  mov rdx, r12                               ; linked-va=0x7fe0020065a5 linked-bytes=49 8b d4
  mov r8, 0x1                                ; linked-va=0x7fe0020065a8 linked-bytes=49 b8 01 00 00 00 00 00 00 00
  call .loc_0258                             ; linked-va=0x7fe0020065b2 linked-bytes=e8 a1 00 00 00
  jmp near .loc_0200                         ; linked-va=0x7fe0020065b7 linked-bytes=e9 44 00 00 00
.loc_01bc:
  lea rdx, [r12-0x1]                         ; linked-va=0x7fe0020065bc linked-bytes=49 8d 54 24 ff
  mov r8, 0x1                                ; linked-va=0x7fe0020065c1 linked-bytes=49 b8 01 00 00 00 00 00 00 00
  call .loc_0258                             ; linked-va=0x7fe0020065cb linked-bytes=e8 88 00 00 00
  mov rdx, r12                               ; linked-va=0x7fe0020065d0 linked-bytes=49 8b d4
  mov r8, 0x1                                ; linked-va=0x7fe0020065d3 linked-bytes=49 b8 01 00 00 00 00 00 00 00
  call .loc_0258                             ; linked-va=0x7fe0020065dd linked-bytes=e8 76 00 00 00
  jmp near .loc_0200                         ; linked-va=0x7fe0020065e2 linked-bytes=e9 19 00 00 00
.loc_01e7:
  lea rdx, [r12-0x1]                         ; linked-va=0x7fe0020065e7 linked-bytes=49 8d 54 24 ff
  mov r8, 0x1                                ; linked-va=0x7fe0020065ec linked-bytes=49 b8 01 00 00 00 00 00 00 00
  call .loc_0258                             ; linked-va=0x7fe0020065f6 linked-bytes=e8 5d 00 00 00
  jmp near .loc_0209                         ; linked-va=0x7fe0020065fb linked-bytes=e9 09 00 00 00
.loc_0200:
  add r12, 0x1                               ; linked-va=0x7fe002006600 linked-bytes=49 83 c4 01
  jmp near .loc_002e                         ; linked-va=0x7fe002006604 linked-bytes=e9 25 fe ff ff
.loc_0209:
  mov eax, esi                               ; linked-va=0x7fe002006609 linked-bytes=8b c6
  add rsp, 0x88                              ; linked-va=0x7fe00200660b linked-bytes=48 81 c4 88 00 00 00
  pop r15                                    ; linked-va=0x7fe002006612 linked-bytes=41 5f
  pop r14                                    ; linked-va=0x7fe002006614 linked-bytes=41 5e
  pop r13                                    ; linked-va=0x7fe002006616 linked-bytes=41 5d
  pop r12                                    ; linked-va=0x7fe002006618 linked-bytes=41 5c
  pop rdi                                    ; linked-va=0x7fe00200661a linked-bytes=5f
  pop rsi                                    ; linked-va=0x7fe00200661b linked-bytes=5e
  pop rbx                                    ; linked-va=0x7fe00200661c linked-bytes=5b
  pop rbp                                    ; linked-va=0x7fe00200661d linked-bytes=5d
  ret                                        ; linked-va=0x7fe00200661e linked-bytes=c3
.loc_021f:
  cmp ebx, 0x0                               ; linked-va=0x7fe00200661f linked-bytes=83 fb 00
  jne near .loc_0230                         ; linked-va=0x7fe002006622 linked-bytes=0f 85 08 00 00 00
  mov rdx, r13                               ; linked-va=0x7fe002006628 linked-bytes=49 8b d5
  jmp near .loc_0254                         ; linked-va=0x7fe00200662b linked-bytes=e9 24 00 00 00
.loc_0230:
  cmp ebx, 0x1                               ; linked-va=0x7fe002006630 linked-bytes=83 fb 01
  jne near .loc_0241                         ; linked-va=0x7fe002006633 linked-bytes=0f 85 08 00 00 00
  mov rdx, r14                               ; linked-va=0x7fe002006639 linked-bytes=49 8b d6
  jmp near .loc_0254                         ; linked-va=0x7fe00200663c linked-bytes=e9 13 00 00 00
.loc_0241:
  cmp ebx, 0x2                               ; linked-va=0x7fe002006641 linked-bytes=83 fb 02
  jne near .loc_0252                         ; linked-va=0x7fe002006644 linked-bytes=0f 85 08 00 00 00
  mov rdx, r15                               ; linked-va=0x7fe00200664a linked-bytes=49 8b d7
  jmp near .loc_0254                         ; linked-va=0x7fe00200664d linked-bytes=e9 02 00 00 00
.loc_0252:
  xor edx, edx                               ; linked-va=0x7fe002006652 linked-bytes=31 d2
.loc_0254:
  add ebx, 0x1                               ; linked-va=0x7fe002006654 linked-bytes=83 c3 01
  ret                                        ; linked-va=0x7fe002006657 linked-bytes=c3
.loc_0258:
  add rsi, r8                                ; linked-va=0x7fe002006658 linked-bytes=4c 01 c6
  push rdx                                   ; linked-va=0x7fe00200665b linked-bytes=52
  push r8                                    ; linked-va=0x7fe00200665c linked-bytes=41 50
  mov ecx, 0xfffffff5                        ; linked-va=0x7fe00200665e linked-bytes=b9 f5 ff ff ff
  sub rsp, 0x28                              ; linked-va=0x7fe002006663 linked-bytes=48 83 ec 28
  call GetStdHandle                          ; linked-va=0x7fe002006667 linked-bytes=ff 15 cb 09 00 00
  add rsp, 0x28                              ; linked-va=0x7fe00200666d linked-bytes=48 83 c4 28
  pop r8                                     ; linked-va=0x7fe002006671 linked-bytes=41 58
  pop rdx                                    ; linked-va=0x7fe002006673 linked-bytes=5a
  mov rcx, rax                               ; linked-va=0x7fe002006674 linked-bytes=48 8b c8
  lea r9, [rbp-0x40]                         ; linked-va=0x7fe002006677 linked-bytes=4c 8d 4d c0
  push 0x0                                   ; linked-va=0x7fe00200667b linked-bytes=6a 00
  sub rsp, 0x20                              ; linked-va=0x7fe00200667d linked-bytes=48 83 ec 20
  call WriteFile                             ; linked-va=0x7fe002006681 linked-bytes=ff 15 a9 09 00 00
  add rsp, 0x28                              ; linked-va=0x7fe002006687 linked-bytes=48 83 c4 28
  ret                                        ; linked-va=0x7fe00200668b linked-bytes=c3
  times 1024 - ($ - printf) db 0xcc
  times 28672 - ($ - $$) db 0xcc

section .dllmain
; bytes=49; invoked once per process after this module is mapped
DllMain:
  cmp edx, 0x1                               ; linked-va=0x7fe002ffe000 linked-bytes=83 fa 01
  jne near .loc_002b                         ; linked-va=0x7fe002ffe003 linked-bytes=0f 85 22 00 00 00
  xor ecx, ecx                               ; linked-va=0x7fe002ffe009 linked-bytes=31 c9
  xor edx, edx                               ; linked-va=0x7fe002ffe00b linked-bytes=31 d2
  xor r8d, r8d                               ; linked-va=0x7fe002ffe00d linked-bytes=45 31 c0
  sub rsp, 0x28                              ; linked-va=0x7fe002ffe010 linked-bytes=48 83 ec 28
  call HeapCreate                            ; linked-va=0x7fe002ffe014 linked-bytes=ff 15 26 90 00 ff
  add rsp, 0x28                              ; linked-va=0x7fe002ffe01a linked-bytes=48 83 c4 28
  mov rcx, msvcrt_dll_globals                ; linked-va=0x7fe002ffe01e linked-bytes=48 b9 00 f0 ff 02 e0 7f 00 00
  mov [rcx], rax                             ; linked-va=0x7fe002ffe028 linked-bytes=48 89 01
.loc_002b:
  mov eax, 0x1                               ; linked-va=0x7fe002ffe02b linked-bytes=b8 01 00 00 00
  ret                                        ; linked-va=0x7fe002ffe030 linked-bytes=c3

section .rdata
; empty

section .data
msvcrt_dll_globals: ; msvcrt.dll's private globals page (CoW, zero at load)
  dq 0 ; crt heap handle -- written by DllMain via HeapCreate
  resb 4088

section .bss
; empty
