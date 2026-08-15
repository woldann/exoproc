; psapi.dll / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export relocation targets.
BITS 64
DEFAULT REL

global GetModuleInformation

section .text
; bytes=4096; loader chooses the image base and RVA

; export=GetModuleInformation ordinal=0 binding=syscall
GetModuleInformation:
  mov eax, 0x7000                            ; linked-va=0x7fe006000000 linked-bytes=b8 00 70 00 00
  syscall                                    ; linked-va=0x7fe006000005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe006000007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe006000008 linked-bytes=90
  nop                                        ; linked-va=0x7fe006000009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00600000a linked-bytes=90
  nop                                        ; linked-va=0x7fe00600000b linked-bytes=90
  nop                                        ; linked-va=0x7fe00600000c linked-bytes=90
  nop                                        ; linked-va=0x7fe00600000d linked-bytes=90
  nop                                        ; linked-va=0x7fe00600000e linked-bytes=90
  nop                                        ; linked-va=0x7fe00600000f linked-bytes=90
  times 1024 - ($ - GetModuleInformation) db 0xcc
  times 4096 - ($ - $$) db 0xcc

section .rdata
; empty

section .data
; empty

section .bss
; empty
