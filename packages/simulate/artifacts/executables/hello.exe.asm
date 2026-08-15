; hello.exe / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export/data relocation targets.
BITS 64
DEFAULT REL

extern printf

global entry

section .text
; bytes=40; loader chooses the image base and RVA
entry:
  mov rdx, output                            ; linked-va=0x7ff600201000 linked-bytes=48 ba 00 30 20 00 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff60020100a linked-bytes=48 b9 27 30 20 00 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff600201014 linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff600201018 linked-bytes=ff 15 e2 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff60020101e linked-bytes=48 83 c4 20
  mov eax, 0x0                               ; linked-va=0x7ff600201022 linked-bytes=b8 00 00 00 00
  ret                                        ; linked-va=0x7ff600201027 linked-bytes=c3

section .rdata
; bytes=42; linker chooses the section RVA

output:
  ; utf8="Hello from a compiled Win64 process.\r\n\u0000"
  db 0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x66, 0x72, 0x6f, 0x6d, 0x20, 0x61, 0x20, 0x63, 0x6f, 0x6d
  db 0x70, 0x69, 0x6c, 0x65, 0x64, 0x20, 0x57, 0x69, 0x6e, 0x36, 0x34, 0x20, 0x70, 0x72, 0x6f, 0x63
  db 0x65, 0x73, 0x73, 0x2e, 0x0d, 0x0a, 0x00

__exoproc_printf_string_format:
  ; utf8="%s\u0000"
  db 0x25, 0x73, 0x00

section .data
; bytes=0; linker chooses the section RVA
; empty

section .bss
; bytes=0; linker chooses the section RVA
; empty
