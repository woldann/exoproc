; chdir.exe / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export/data relocation targets.
BITS 64
DEFAULT REL

extern SetCurrentDirectoryA
extern printf

global entry

section .text
; bytes=81; loader chooses the image base and RVA
entry:
  cmp ecx, 0x1                               ; linked-va=0x7ff603401000 linked-bytes=83 f9 01
  je near .loc_004e                          ; linked-va=0x7ff603401003 linked-bytes=0f 84 45 00 00 00
  mov rax, rdx                               ; linked-va=0x7ff603401009 linked-bytes=48 8b c2
  mov rcx, [rax+0x8]                         ; linked-va=0x7ff60340100c linked-bytes=48 8b 48 08
  sub rsp, 0x20                              ; linked-va=0x7ff603401010 linked-bytes=48 83 ec 20
  call SetCurrentDirectoryA                  ; linked-va=0x7ff603401014 linked-bytes=ff 15 e6 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff60340101a linked-bytes=48 83 c4 20
  test eax, eax                              ; linked-va=0x7ff60340101e linked-bytes=85 c0
  jne near .loc_004e                         ; linked-va=0x7ff603401020 linked-bytes=0f 85 28 00 00 00
  mov rdx, notFound                          ; linked-va=0x7ff603401026 linked-bytes=48 ba 00 30 40 03 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff603401030 linked-bytes=48 b9 2d 30 40 03 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff60340103a linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff60340103e linked-bytes=ff 15 c4 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603401044 linked-bytes=48 83 c4 20
  mov eax, 0x1                               ; linked-va=0x7ff603401048 linked-bytes=b8 01 00 00 00
  ret                                        ; linked-va=0x7ff60340104d linked-bytes=c3
.loc_004e:
  xor eax, eax                               ; linked-va=0x7ff60340104e linked-bytes=31 c0
  ret                                        ; linked-va=0x7ff603401050 linked-bytes=c3

section .rdata
; bytes=48; linker chooses the section RVA

notFound:
  ; utf8="The system cannot find the path specified.\r\n\u0000"
  db 0x54, 0x68, 0x65, 0x20, 0x73, 0x79, 0x73, 0x74, 0x65, 0x6d, 0x20, 0x63, 0x61, 0x6e, 0x6e, 0x6f
  db 0x74, 0x20, 0x66, 0x69, 0x6e, 0x64, 0x20, 0x74, 0x68, 0x65, 0x20, 0x70, 0x61, 0x74, 0x68, 0x20
  db 0x73, 0x70, 0x65, 0x63, 0x69, 0x66, 0x69, 0x65, 0x64, 0x2e, 0x0d, 0x0a, 0x00

__exoproc_printf_string_format:
  ; utf8="%s\u0000"
  db 0x25, 0x73, 0x00

section .data
; bytes=0; linker chooses the section RVA
; empty

section .bss
; bytes=0; linker chooses the section RVA
; empty
