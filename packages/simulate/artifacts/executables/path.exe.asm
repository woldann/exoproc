; path.exe / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export/data relocation targets.
BITS 64
DEFAULT REL

extern SetEnvironmentVariableA
extern GetEnvironmentVariableA
extern printf

global entry

section .text
; bytes=212; loader chooses the image base and RVA
entry:
  cmp ecx, 0x1                               ; linked-va=0x7ff600c01000 linked-bytes=83 f9 01
  je near .loc_0033                          ; linked-va=0x7ff600c01003 linked-bytes=0f 84 2a 00 00 00
  mov rax, rdx                               ; linked-va=0x7ff600c01009 linked-bytes=48 8b c2
  mov rdx, [rax+0x8]                         ; linked-va=0x7ff600c0100c linked-bytes=48 8b 50 08
  mov rcx, pathName                          ; linked-va=0x7ff600c01010 linked-bytes=48 b9 00 30 c0 00 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff600c0101a linked-bytes=48 83 ec 20
  call SetEnvironmentVariableA               ; linked-va=0x7ff600c0101e linked-bytes=ff 15 dc 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff600c01024 linked-bytes=48 83 c4 20
  test eax, eax                              ; linked-va=0x7ff600c01028 linked-bytes=85 c0
  je near .loc_00ce                          ; linked-va=0x7ff600c0102a linked-bytes=0f 84 9e 00 00 00
  xor eax, eax                               ; linked-va=0x7ff600c01030 linked-bytes=31 c0
  ret                                        ; linked-va=0x7ff600c01032 linked-bytes=c3
.loc_0033:
  mov rcx, pathName                          ; linked-va=0x7ff600c01033 linked-bytes=48 b9 00 30 c0 00 f6 7f 00 00
  mov rdx, pathValue                         ; linked-va=0x7ff600c0103d linked-bytes=48 ba 11 30 c0 00 f6 7f 00 00
  mov r8, 0x1000                             ; linked-va=0x7ff600c01047 linked-bytes=49 b8 00 10 00 00 00 00 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff600c01051 linked-bytes=48 83 ec 20
  call GetEnvironmentVariableA               ; linked-va=0x7ff600c01055 linked-bytes=ff 15 ad 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff600c0105b linked-bytes=48 83 c4 20
  mov r13, rax                               ; linked-va=0x7ff600c0105f linked-bytes=4c 8b e8
  mov rdx, pathPrefix                        ; linked-va=0x7ff600c01062 linked-bytes=48 ba 05 30 c0 00 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff600c0106c linked-bytes=48 b9 0e 30 c0 00 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff600c01076 linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff600c0107a linked-bytes=ff 15 90 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff600c01080 linked-bytes=48 83 c4 20
  mov r8, r13                                ; linked-va=0x7ff600c01084 linked-bytes=4d 8b c5
  mov rdx, pathValue                         ; linked-va=0x7ff600c01087 linked-bytes=48 ba 11 30 c0 00 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff600c01091 linked-bytes=48 b9 0e 30 c0 00 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff600c0109b linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff600c0109f linked-bytes=ff 15 6b 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff600c010a5 linked-bytes=48 83 c4 20
  mov rdx, newline                           ; linked-va=0x7ff600c010a9 linked-bytes=48 ba 0b 30 c0 00 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff600c010b3 linked-bytes=48 b9 0e 30 c0 00 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff600c010bd linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff600c010c1 linked-bytes=ff 15 49 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff600c010c7 linked-bytes=48 83 c4 20
  xor eax, eax                               ; linked-va=0x7ff600c010cb linked-bytes=31 c0
  ret                                        ; linked-va=0x7ff600c010cd linked-bytes=c3
.loc_00ce:
  mov eax, 0x1                               ; linked-va=0x7ff600c010ce linked-bytes=b8 01 00 00 00
  ret                                        ; linked-va=0x7ff600c010d3 linked-bytes=c3

section .rdata
; bytes=17; linker chooses the section RVA

pathName:
  ; utf8="PATH\u0000"
  db 0x50, 0x41, 0x54, 0x48, 0x00

pathPrefix:
  ; utf8="PATH=\u0000"
  db 0x50, 0x41, 0x54, 0x48, 0x3d, 0x00

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

pathValue:
  resb 4096
