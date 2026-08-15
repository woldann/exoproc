; echo.exe / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export/data relocation targets.
BITS 64
DEFAULT REL

extern strlen
extern printf

global entry

section .text
; bytes=169; loader chooses the image base and RVA
entry:
  mov eax, ecx                               ; linked-va=0x7ff603e01000 linked-bytes=8b c1
  sub eax, 0x1                               ; linked-va=0x7ff603e01002 linked-bytes=83 e8 01
  mov r15, rax                               ; linked-va=0x7ff603e01005 linked-bytes=4c 8b f8
  cmp r15, 0x0                               ; linked-va=0x7ff603e01008 linked-bytes=49 83 ff 00
  je near .loc_0084                          ; linked-va=0x7ff603e0100c linked-bytes=0f 84 72 00 00 00
  mov r14, rdx                               ; linked-va=0x7ff603e01012 linked-bytes=4c 8b f2
  add r14, 0x8                               ; linked-va=0x7ff603e01015 linked-bytes=49 83 c6 08
.loc_0019:
  mov r13, [r14]                             ; linked-va=0x7ff603e01019 linked-bytes=4d 8b 2e
  mov rcx, r13                               ; linked-va=0x7ff603e0101c linked-bytes=49 8b cd
  sub rsp, 0x20                              ; linked-va=0x7ff603e0101f linked-bytes=48 83 ec 20
  call strlen                                ; linked-va=0x7ff603e01023 linked-bytes=ff 15 d7 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603e01029 linked-bytes=48 83 c4 20
  mov r8, rax                                ; linked-va=0x7ff603e0102d linked-bytes=4c 8b c0
  mov rdx, r13                               ; linked-va=0x7ff603e01030 linked-bytes=49 8b d5
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff603e01033 linked-bytes=48 b9 05 30 e0 03 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff603e0103d linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff603e01041 linked-bytes=ff 15 c1 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603e01047 linked-bytes=48 83 c4 20
  sub r15, 0x1                               ; linked-va=0x7ff603e0104b linked-bytes=49 83 ef 01
  cmp r15, 0x0                               ; linked-va=0x7ff603e0104f linked-bytes=49 83 ff 00
  je near .loc_0084                          ; linked-va=0x7ff603e01053 linked-bytes=0f 84 2b 00 00 00
  mov rdx, space                             ; linked-va=0x7ff603e01059 linked-bytes=48 ba 00 30 e0 03 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff603e01063 linked-bytes=48 b9 05 30 e0 03 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff603e0106d linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff603e01071 linked-bytes=ff 15 91 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603e01077 linked-bytes=48 83 c4 20
  add r14, 0x8                               ; linked-va=0x7ff603e0107b linked-bytes=49 83 c6 08
  jmp near .loc_0019                         ; linked-va=0x7ff603e0107f linked-bytes=e9 95 ff ff ff
.loc_0084:
  mov rdx, newline                           ; linked-va=0x7ff603e01084 linked-bytes=48 ba 02 30 e0 03 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff603e0108e linked-bytes=48 b9 05 30 e0 03 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff603e01098 linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff603e0109c linked-bytes=ff 15 66 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603e010a2 linked-bytes=48 83 c4 20
  xor eax, eax                               ; linked-va=0x7ff603e010a6 linked-bytes=31 c0
  ret                                        ; linked-va=0x7ff603e010a8 linked-bytes=c3

section .rdata
; bytes=8; linker chooses the section RVA

space:
  ; utf8=" \u0000"
  db 0x20, 0x00

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
; bytes=0; linker chooses the section RVA
; empty
