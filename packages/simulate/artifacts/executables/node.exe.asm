; node.exe / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export/data relocation targets.
BITS 64
DEFAULT REL

extern createJSProcess
extern enterJSProcess
extern terminateJSProcess
extern printf

global entry

section .text
; bytes=196; loader chooses the image base and RVA
entry:
  cmp ecx, 0x1                               ; linked-va=0x7ff600a01000 linked-bytes=83 f9 01
  je near .loc_009c                          ; linked-va=0x7ff600a01003 linked-bytes=0f 84 93 00 00 00
  mov r15d, ecx                              ; linked-va=0x7ff600a01009 linked-bytes=44 8b f9
  mov r14, rdx                               ; linked-va=0x7ff600a0100c linked-bytes=4c 8b f2
  mov rbx, args                              ; linked-va=0x7ff600a0100f linked-bytes=48 bb 35 30 a0 00 f6 7f 00 00
  mov r10d, r15d                             ; linked-va=0x7ff600a01019 linked-bytes=45 8b d7
  cmp r10d, 0x100                            ; linked-va=0x7ff600a0101c linked-bytes=41 81 fa 00 01 00 00
  jbe .loc_002f                              ; linked-va=0x7ff600a01023 linked-bytes=0f 86 06 00 00 00
  mov r10d, 0x100                            ; linked-va=0x7ff600a01029 linked-bytes=41 ba 00 01 00 00
.loc_002f:
  xor r11d, r11d                             ; linked-va=0x7ff600a0102f linked-bytes=45 31 db
  mov r8, r14                                ; linked-va=0x7ff600a01032 linked-bytes=4d 8b c6
  mov r12, rbx                               ; linked-va=0x7ff600a01035 linked-bytes=4c 8b e3
.loc_0038:
  cmp r11d, r10d                             ; linked-va=0x7ff600a01038 linked-bytes=45 39 d3
  jae .loc_0059                              ; linked-va=0x7ff600a0103b linked-bytes=0f 83 18 00 00 00
  mov rax, [r8]                              ; linked-va=0x7ff600a01041 linked-bytes=49 8b 00
  mov [r12], rax                             ; linked-va=0x7ff600a01044 linked-bytes=49 89 04 24
  add r8, 0x8                                ; linked-va=0x7ff600a01048 linked-bytes=49 83 c0 08
  add r12, 0x8                               ; linked-va=0x7ff600a0104c linked-bytes=49 83 c4 08
  add r11d, 0x1                              ; linked-va=0x7ff600a01050 linked-bytes=41 83 c3 01
  jmp near .loc_0038                         ; linked-va=0x7ff600a01054 linked-bytes=e9 df ff ff ff
.loc_0059:
  sub rsp, 0x20                              ; linked-va=0x7ff600a01059 linked-bytes=48 83 ec 20
  call createJSProcess                       ; linked-va=0x7ff600a0105d linked-bytes=ff 15 9d 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff600a01063 linked-bytes=48 83 c4 20
  mov r12, rax                               ; linked-va=0x7ff600a01067 linked-bytes=4c 8b e0
  mov rcx, r12                               ; linked-va=0x7ff600a0106a linked-bytes=49 8b cc
  mov rdx, r15                               ; linked-va=0x7ff600a0106d linked-bytes=49 8b d7
  mov r8, rbx                                ; linked-va=0x7ff600a01070 linked-bytes=4c 8b c3
  sub rsp, 0x20                              ; linked-va=0x7ff600a01073 linked-bytes=48 83 ec 20
  call enterJSProcess                        ; linked-va=0x7ff600a01077 linked-bytes=ff 15 8b 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff600a0107d linked-bytes=48 83 c4 20
  mov r13d, eax                              ; linked-va=0x7ff600a01081 linked-bytes=44 8b e8
  mov rcx, r12                               ; linked-va=0x7ff600a01084 linked-bytes=49 8b cc
  mov rdx, r13                               ; linked-va=0x7ff600a01087 linked-bytes=49 8b d5
  sub rsp, 0x20                              ; linked-va=0x7ff600a0108a linked-bytes=48 83 ec 20
  call terminateJSProcess                    ; linked-va=0x7ff600a0108e linked-bytes=ff 15 7c 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff600a01094 linked-bytes=48 83 c4 20
  mov eax, r13d                              ; linked-va=0x7ff600a01098 linked-bytes=41 8b c5
  ret                                        ; linked-va=0x7ff600a0109b linked-bytes=c3
.loc_009c:
  mov rdx, usage                             ; linked-va=0x7ff600a0109c linked-bytes=48 ba 00 30 a0 00 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff600a010a6 linked-bytes=48 b9 32 30 a0 00 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff600a010b0 linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff600a010b4 linked-bytes=ff 15 5e 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff600a010ba linked-bytes=48 83 c4 20
  mov eax, 0x9                               ; linked-va=0x7ff600a010be linked-bytes=b8 09 00 00 00
  ret                                        ; linked-va=0x7ff600a010c3 linked-bytes=c3

section .rdata
; bytes=53; linker chooses the section RVA

usage:
  ; utf8="Usage: node [-e <code> | <script.js>] [args...]\r\n\u0000"
  db 0x55, 0x73, 0x61, 0x67, 0x65, 0x3a, 0x20, 0x6e, 0x6f, 0x64, 0x65, 0x20, 0x5b, 0x2d, 0x65, 0x20
  db 0x3c, 0x63, 0x6f, 0x64, 0x65, 0x3e, 0x20, 0x7c, 0x20, 0x3c, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74
  db 0x2e, 0x6a, 0x73, 0x3e, 0x5d, 0x20, 0x5b, 0x61, 0x72, 0x67, 0x73, 0x2e, 0x2e, 0x2e, 0x5d, 0x0d
  db 0x0a, 0x00

__exoproc_printf_string_format:
  ; utf8="%s\u0000"
  db 0x25, 0x73, 0x00

section .data
; bytes=0; linker chooses the section RVA
; empty

section .bss
; bytes=2048; linker chooses the section RVA

args:
  resb 2048
