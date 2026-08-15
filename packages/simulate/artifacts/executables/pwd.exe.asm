; pwd.exe / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export/data relocation targets.
BITS 64
DEFAULT REL

extern GetCurrentDirectoryA
extern printf

global entry

section .text
; bytes=103; loader chooses the image base and RVA
entry:
  mov ecx, 0x104                             ; linked-va=0x7ff601001000 linked-bytes=b9 04 01 00 00
  mov rdx, currentDirectory                  ; linked-va=0x7ff601001005 linked-bytes=48 ba 06 30 00 01 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff60100100f linked-bytes=48 83 ec 20
  call GetCurrentDirectoryA                  ; linked-va=0x7ff601001013 linked-bytes=ff 15 e7 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff601001019 linked-bytes=48 83 c4 20
  mov r8, rax                                ; linked-va=0x7ff60100101d linked-bytes=4c 8b c0
  mov rdx, currentDirectory                  ; linked-va=0x7ff601001020 linked-bytes=48 ba 06 30 00 01 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff60100102a linked-bytes=48 b9 03 30 00 01 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff601001034 linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff601001038 linked-bytes=ff 15 ca 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff60100103e linked-bytes=48 83 c4 20
  mov rdx, newline                           ; linked-va=0x7ff601001042 linked-bytes=48 ba 00 30 00 01 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff60100104c linked-bytes=48 b9 03 30 00 01 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff601001056 linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff60100105a linked-bytes=ff 15 a8 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff601001060 linked-bytes=48 83 c4 20
  xor eax, eax                               ; linked-va=0x7ff601001064 linked-bytes=31 c0
  ret                                        ; linked-va=0x7ff601001066 linked-bytes=c3

section .rdata
; bytes=6; linker chooses the section RVA

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
; bytes=260; linker chooses the section RVA

currentDirectory:
  resb 260
