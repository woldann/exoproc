; cat.exe / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export/data relocation targets.
BITS 64
DEFAULT REL

extern GetStdHandle
extern fopen
extern fread
extern fwrite
extern fclose
extern printf

global entry

section .text
; bytes=305; loader chooses the image base and RVA
entry:
  cmp ecx, 0x1                               ; linked-va=0x7ff603001000 linked-bytes=83 f9 01
  je near .loc_0106                          ; linked-va=0x7ff603001003 linked-bytes=0f 84 fd 00 00 00
  mov eax, ecx                               ; linked-va=0x7ff603001009 linked-bytes=8b c1
  sub eax, 0x1                               ; linked-va=0x7ff60300100b linked-bytes=83 e8 01
  mov r15, rax                               ; linked-va=0x7ff60300100e linked-bytes=4c 8b f8
  mov r14, rdx                               ; linked-va=0x7ff603001011 linked-bytes=4c 8b f2
  add r14, 0x8                               ; linked-va=0x7ff603001014 linked-bytes=49 83 c6 08
  mov ecx, 0xfffffff5                        ; linked-va=0x7ff603001018 linked-bytes=b9 f5 ff ff ff
  sub rsp, 0x20                              ; linked-va=0x7ff60300101d linked-bytes=48 83 ec 20
  call GetStdHandle                          ; linked-va=0x7ff603001021 linked-bytes=ff 15 d9 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603001027 linked-bytes=48 83 c4 20
  mov r12, rax                               ; linked-va=0x7ff60300102b linked-bytes=4c 8b e0
.loc_002e:
  mov r13, [r14]                             ; linked-va=0x7ff60300102e linked-bytes=4d 8b 2e
  mov rcx, r13                               ; linked-va=0x7ff603001031 linked-bytes=49 8b cd
  mov rdx, readMode                          ; linked-va=0x7ff603001034 linked-bytes=48 ba 00 30 00 03 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff60300103e linked-bytes=48 83 ec 20
  call fopen                                 ; linked-va=0x7ff603001042 linked-bytes=ff 15 c0 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603001048 linked-bytes=48 83 c4 20
  mov rbx, rax                               ; linked-va=0x7ff60300104c linked-bytes=48 8b d8
  test rax, rax                              ; linked-va=0x7ff60300104f linked-bytes=48 85 c0
  je near .loc_00e5                          ; linked-va=0x7ff603001052 linked-bytes=0f 84 8d 00 00 00
.loc_0058:
  mov rcx, buffer                            ; linked-va=0x7ff603001058 linked-bytes=48 b9 3b 30 00 03 f6 7f 00 00
  mov rdx, 0x1                               ; linked-va=0x7ff603001062 linked-bytes=48 ba 01 00 00 00 00 00 00 00
  mov r8, 0x1000                             ; linked-va=0x7ff60300106c linked-bytes=49 b8 00 10 00 00 00 00 00 00
  mov r9, rbx                                ; linked-va=0x7ff603001076 linked-bytes=4c 8b cb
  sub rsp, 0x20                              ; linked-va=0x7ff603001079 linked-bytes=48 83 ec 20
  call fread                                 ; linked-va=0x7ff60300107d linked-bytes=ff 15 8d 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603001083 linked-bytes=48 83 c4 20
  test rax, rax                              ; linked-va=0x7ff603001087 linked-bytes=48 85 c0
  je near .loc_00bd                          ; linked-va=0x7ff60300108a linked-bytes=0f 84 2d 00 00 00
  mov r8, rax                                ; linked-va=0x7ff603001090 linked-bytes=4c 8b c0
  mov rcx, buffer                            ; linked-va=0x7ff603001093 linked-bytes=48 b9 3b 30 00 03 f6 7f 00 00
  mov rdx, 0x1                               ; linked-va=0x7ff60300109d linked-bytes=48 ba 01 00 00 00 00 00 00 00
  mov r9, r12                                ; linked-va=0x7ff6030010a7 linked-bytes=4d 8b cc
  sub rsp, 0x20                              ; linked-va=0x7ff6030010aa linked-bytes=48 83 ec 20
  call fwrite                                ; linked-va=0x7ff6030010ae linked-bytes=ff 15 64 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff6030010b4 linked-bytes=48 83 c4 20
  jmp near .loc_0058                         ; linked-va=0x7ff6030010b8 linked-bytes=e9 9b ff ff ff
.loc_00bd:
  mov rcx, rbx                               ; linked-va=0x7ff6030010bd linked-bytes=48 8b cb
  sub rsp, 0x20                              ; linked-va=0x7ff6030010c0 linked-bytes=48 83 ec 20
  call fclose                                ; linked-va=0x7ff6030010c4 linked-bytes=ff 15 56 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff6030010ca linked-bytes=48 83 c4 20
  sub r15, 0x1                               ; linked-va=0x7ff6030010ce linked-bytes=49 83 ef 01
  cmp r15, 0x0                               ; linked-va=0x7ff6030010d2 linked-bytes=49 83 ff 00
  je near .loc_012e                          ; linked-va=0x7ff6030010d6 linked-bytes=0f 84 52 00 00 00
  add r14, 0x8                               ; linked-va=0x7ff6030010dc linked-bytes=49 83 c6 08
  jmp near .loc_002e                         ; linked-va=0x7ff6030010e0 linked-bytes=e9 49 ff ff ff
.loc_00e5:
  mov rcx, openError                         ; linked-va=0x7ff6030010e5 linked-bytes=48 b9 22 30 00 03 f6 7f 00 00
  mov rdx, r13                               ; linked-va=0x7ff6030010ef linked-bytes=49 8b d5
  sub rsp, 0x20                              ; linked-va=0x7ff6030010f2 linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff6030010f6 linked-bytes=ff 15 2c 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff6030010fc linked-bytes=48 83 c4 20
  mov eax, 0x1                               ; linked-va=0x7ff603001100 linked-bytes=b8 01 00 00 00
  ret                                        ; linked-va=0x7ff603001105 linked-bytes=c3
.loc_0106:
  mov rdx, usage                             ; linked-va=0x7ff603001106 linked-bytes=48 ba 03 30 00 03 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff603001110 linked-bytes=48 b9 38 30 00 03 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff60300111a linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff60300111e linked-bytes=ff 15 04 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603001124 linked-bytes=48 83 c4 20
  mov eax, 0x1                               ; linked-va=0x7ff603001128 linked-bytes=b8 01 00 00 00
  ret                                        ; linked-va=0x7ff60300112d linked-bytes=c3
.loc_012e:
  xor eax, eax                               ; linked-va=0x7ff60300112e linked-bytes=31 c0
  ret                                        ; linked-va=0x7ff603001130 linked-bytes=c3

section .rdata
; bytes=59; linker chooses the section RVA

readMode:
  ; utf8="rb\u0000"
  db 0x72, 0x62, 0x00

usage:
  ; utf8="Usage: cat <file> [file ...]\r\n\u0000"
  db 0x55, 0x73, 0x61, 0x67, 0x65, 0x3a, 0x20, 0x63, 0x61, 0x74, 0x20, 0x3c, 0x66, 0x69, 0x6c, 0x65
  db 0x3e, 0x20, 0x5b, 0x66, 0x69, 0x6c, 0x65, 0x20, 0x2e, 0x2e, 0x2e, 0x5d, 0x0d, 0x0a, 0x00

openError:
  ; utf8="cat: cannot open %s\r\n\u0000"
  db 0x63, 0x61, 0x74, 0x3a, 0x20, 0x63, 0x61, 0x6e, 0x6e, 0x6f, 0x74, 0x20, 0x6f, 0x70, 0x65, 0x6e
  db 0x20, 0x25, 0x73, 0x0d, 0x0a, 0x00

__exoproc_printf_string_format:
  ; utf8="%s\u0000"
  db 0x25, 0x73, 0x00

section .data
; bytes=0; linker chooses the section RVA
; empty

section .bss
; bytes=4096; linker chooses the section RVA

buffer:
  resb 4096
