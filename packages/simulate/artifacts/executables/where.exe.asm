; where.exe / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export/data relocation targets.
BITS 64
DEFAULT REL

extern SearchPathA
extern printf

global entry

section .text
; bytes=217; loader chooses the image base and RVA
entry:
  cmp ecx, 0x1                               ; linked-va=0x7ff601601000 linked-bytes=83 f9 01
  je near .loc_00b1                          ; linked-va=0x7ff601601003 linked-bytes=0f 84 a8 00 00 00
  mov rax, rdx                               ; linked-va=0x7ff601601009 linked-bytes=48 8b c2
  mov rdx, [rax+0x8]                         ; linked-va=0x7ff60160100c linked-bytes=48 8b 50 08
  xor rcx, rcx                               ; linked-va=0x7ff601601010 linked-bytes=48 31 c9
  xor r8, r8                                 ; linked-va=0x7ff601601013 linked-bytes=4d 31 c0
  mov r9d, 0x1000                            ; linked-va=0x7ff601601016 linked-bytes=41 b9 00 10 00 00
  push 0x0                                   ; linked-va=0x7ff60160101c linked-bytes=6a 00
  mov rax, result                            ; linked-va=0x7ff60160101e linked-bytes=48 b8 54 30 60 01 f6 7f 00 00
  push rax                                   ; linked-va=0x7ff601601028 linked-bytes=50
  sub rsp, 0x20                              ; linked-va=0x7ff601601029 linked-bytes=48 83 ec 20
  call SearchPathA                           ; linked-va=0x7ff60160102d linked-bytes=ff 15 cd 0f 00 00
  add rsp, 0x30                              ; linked-va=0x7ff601601033 linked-bytes=48 83 c4 30
  test eax, eax                              ; linked-va=0x7ff601601037 linked-bytes=85 c0
  je near .loc_0089                          ; linked-va=0x7ff601601039 linked-bytes=0f 84 4a 00 00 00
  mov r8, rax                                ; linked-va=0x7ff60160103f linked-bytes=4c 8b c0
  mov rdx, result                            ; linked-va=0x7ff601601042 linked-bytes=48 ba 54 30 60 01 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff60160104c linked-bytes=48 b9 51 30 60 01 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff601601056 linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff60160105a linked-bytes=ff 15 a8 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff601601060 linked-bytes=48 83 c4 20
  mov rdx, newline                           ; linked-va=0x7ff601601064 linked-bytes=48 ba 4e 30 60 01 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff60160106e linked-bytes=48 b9 51 30 60 01 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff601601078 linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff60160107c linked-bytes=ff 15 86 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff601601082 linked-bytes=48 83 c4 20
  xor eax, eax                               ; linked-va=0x7ff601601086 linked-bytes=31 c0
  ret                                        ; linked-va=0x7ff601601088 linked-bytes=c3
.loc_0089:
  mov rdx, notFound                          ; linked-va=0x7ff601601089 linked-bytes=48 ba 17 30 60 01 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff601601093 linked-bytes=48 b9 51 30 60 01 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff60160109d linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff6016010a1 linked-bytes=ff 15 61 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff6016010a7 linked-bytes=48 83 c4 20
  mov eax, 0x1                               ; linked-va=0x7ff6016010ab linked-bytes=b8 01 00 00 00
  ret                                        ; linked-va=0x7ff6016010b0 linked-bytes=c3
.loc_00b1:
  mov rdx, usage                             ; linked-va=0x7ff6016010b1 linked-bytes=48 ba 00 30 60 01 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff6016010bb linked-bytes=48 b9 51 30 60 01 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff6016010c5 linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff6016010c9 linked-bytes=ff 15 39 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff6016010cf linked-bytes=48 83 c4 20
  mov eax, 0x1                               ; linked-va=0x7ff6016010d3 linked-bytes=b8 01 00 00 00
  ret                                        ; linked-va=0x7ff6016010d8 linked-bytes=c3

section .rdata
; bytes=84; linker chooses the section RVA

usage:
  ; utf8="Usage: where command\r\n\u0000"
  db 0x55, 0x73, 0x61, 0x67, 0x65, 0x3a, 0x20, 0x77, 0x68, 0x65, 0x72, 0x65, 0x20, 0x63, 0x6f, 0x6d
  db 0x6d, 0x61, 0x6e, 0x64, 0x0d, 0x0a, 0x00

notFound:
  ; utf8="INFO: Could not find files for the given pattern(s).\r\n\u0000"
  db 0x49, 0x4e, 0x46, 0x4f, 0x3a, 0x20, 0x43, 0x6f, 0x75, 0x6c, 0x64, 0x20, 0x6e, 0x6f, 0x74, 0x20
  db 0x66, 0x69, 0x6e, 0x64, 0x20, 0x66, 0x69, 0x6c, 0x65, 0x73, 0x20, 0x66, 0x6f, 0x72, 0x20, 0x74
  db 0x68, 0x65, 0x20, 0x67, 0x69, 0x76, 0x65, 0x6e, 0x20, 0x70, 0x61, 0x74, 0x74, 0x65, 0x72, 0x6e
  db 0x28, 0x73, 0x29, 0x2e, 0x0d, 0x0a, 0x00

newline:
  ; utf8="\r\n\u0000"
  db 0x0d, 0x0a, 0x00

__exoproc_printf_string_format:
  ; utf8="%s\u0000"
  db 0x25, 0x73, 0x00

section .data
; bytes=0; linker chooses the section RVA
; empty

section .bss
; bytes=4096; linker chooses the section RVA

result:
  resb 4096
