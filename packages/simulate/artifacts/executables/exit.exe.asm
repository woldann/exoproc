; exit.exe / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export/data relocation targets.
BITS 64
DEFAULT REL

extern printf

global entry

section .text
; bytes=40; loader chooses the image base and RVA
entry:
  mov rdx, output                            ; linked-va=0x7ff600001000 linked-bytes=48 ba 00 30 00 00 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff60000100a linked-bytes=48 b9 01 30 00 00 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff600001014 linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff600001018 linked-bytes=ff 15 e2 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff60000101e linked-bytes=48 83 c4 20
  mov eax, 0x45584954                        ; linked-va=0x7ff600001022 linked-bytes=b8 54 49 58 45
  ret                                        ; linked-va=0x7ff600001027 linked-bytes=c3

section .rdata
; bytes=4; linker chooses the section RVA

output:
  ; utf8="\u0000"
  db 0x00

__exoproc_printf_string_format:
  ; utf8="%s\u0000"
  db 0x25, 0x73, 0x00

section .data
; bytes=0; linker chooses the section RVA
; empty

section .bss
; bytes=0; linker chooses the section RVA
; empty
