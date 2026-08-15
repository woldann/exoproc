; clear.exe / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export/data relocation targets.
BITS 64
DEFAULT REL

extern GetStdHandle
extern FillConsoleOutputCharacterA
extern SetConsoleCursorPosition

global entry

section .text
; bytes=101; loader chooses the image base and RVA
entry:
  push rbx                                   ; linked-va=0x7ff603601000 linked-bytes=53
  mov ecx, 0xfffffff5                        ; linked-va=0x7ff603601001 linked-bytes=b9 f5 ff ff ff
  sub rsp, 0x20                              ; linked-va=0x7ff603601006 linked-bytes=48 83 ec 20
  call GetStdHandle                          ; linked-va=0x7ff60360100a linked-bytes=ff 15 f0 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603601010 linked-bytes=48 83 c4 20
  mov rbx, rax                               ; linked-va=0x7ff603601014 linked-bytes=48 8b d8
  mov rcx, rbx                               ; linked-va=0x7ff603601017 linked-bytes=48 8b cb
  mov edx, 0x20                              ; linked-va=0x7ff60360101a linked-bytes=ba 20 00 00 00
  mov r8d, 0xffffffff                        ; linked-va=0x7ff60360101f linked-bytes=41 b8 ff ff ff ff
  mov r9d, 0x0                               ; linked-va=0x7ff603601025 linked-bytes=41 b9 00 00 00 00
  mov rax, written                           ; linked-va=0x7ff60360102b linked-bytes=48 b8 00 30 60 03 f6 7f 00 00
  sub rsp, 0x30                              ; linked-va=0x7ff603601035 linked-bytes=48 83 ec 30
  mov [rsp+0x20], rax                        ; linked-va=0x7ff603601039 linked-bytes=48 89 44 24 20
  call FillConsoleOutputCharacterA           ; linked-va=0x7ff60360103e linked-bytes=ff 15 c4 0f 00 00
  add rsp, 0x30                              ; linked-va=0x7ff603601044 linked-bytes=48 83 c4 30
  mov rcx, rbx                               ; linked-va=0x7ff603601048 linked-bytes=48 8b cb
  mov edx, 0x0                               ; linked-va=0x7ff60360104b linked-bytes=ba 00 00 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff603601050 linked-bytes=48 83 ec 20
  call SetConsoleCursorPosition              ; linked-va=0x7ff603601054 linked-bytes=ff 15 b6 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff60360105a linked-bytes=48 83 c4 20
  mov eax, 0x0                               ; linked-va=0x7ff60360105e linked-bytes=b8 00 00 00 00
  pop rbx                                    ; linked-va=0x7ff603601063 linked-bytes=5b
  ret                                        ; linked-va=0x7ff603601064 linked-bytes=c3

section .rdata
; bytes=0; linker chooses the section RVA
; empty

section .data
; bytes=0; linker chooses the section RVA
; empty

section .bss
; bytes=4; linker chooses the section RVA

written:
  resb 4
