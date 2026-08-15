; set.exe / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export/data relocation targets.
BITS 64
DEFAULT REL

extern _putenv
extern printf

global entry

section .text
; bytes=71; loader chooses the image base and RVA
entry:
  cmp ecx, 0x1                               ; linked-va=0x7ff601201000 linked-bytes=83 f9 01
  je near .loc_001f                          ; linked-va=0x7ff601201003 linked-bytes=0f 84 16 00 00 00
  mov rax, rdx                               ; linked-va=0x7ff601201009 linked-bytes=48 8b c2
  mov rcx, [rax+0x8]                         ; linked-va=0x7ff60120100c linked-bytes=48 8b 48 08
  sub rsp, 0x20                              ; linked-va=0x7ff601201010 linked-bytes=48 83 ec 20
  call _putenv                               ; linked-va=0x7ff601201014 linked-bytes=ff 15 e6 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff60120101a linked-bytes=48 83 c4 20
  ret                                        ; linked-va=0x7ff60120101e linked-bytes=c3
.loc_001f:
  mov rdx, usage                             ; linked-va=0x7ff60120101f linked-bytes=48 ba 00 30 20 01 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff601201029 linked-bytes=48 b9 18 30 20 01 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff601201033 linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff601201037 linked-bytes=ff 15 cb 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff60120103d linked-bytes=48 83 c4 20
  mov eax, 0x1                               ; linked-va=0x7ff601201041 linked-bytes=b8 01 00 00 00
  ret                                        ; linked-va=0x7ff601201046 linked-bytes=c3

section .rdata
; bytes=27; linker chooses the section RVA

usage:
  ; utf8="Usage: set NAME=VALUE\r\n\u0000"
  db 0x55, 0x73, 0x61, 0x67, 0x65, 0x3a, 0x20, 0x73, 0x65, 0x74, 0x20, 0x4e, 0x41, 0x4d, 0x45, 0x3d
  db 0x56, 0x41, 0x4c, 0x55, 0x45, 0x0d, 0x0a, 0x00

__exoproc_printf_string_format:
  ; utf8="%s\u0000"
  db 0x25, 0x73, 0x00

section .data
; bytes=0; linker chooses the section RVA
; empty

section .bss
; bytes=0; linker chooses the section RVA
; empty
