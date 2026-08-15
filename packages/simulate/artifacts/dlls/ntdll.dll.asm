; ntdll.dll / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export relocation targets.
BITS 64
DEFAULT REL

global RtlImageNtHeader

section .text
; bytes=4096; loader chooses the image base and RVA

; export=RtlImageNtHeader ordinal=0 binding=syscall
RtlImageNtHeader:
  mov eax, 0x2000                            ; linked-va=0x7fe001000000 linked-bytes=b8 00 20 00 00
  syscall                                    ; linked-va=0x7fe001000005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe001000007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe001000008 linked-bytes=90
  nop                                        ; linked-va=0x7fe001000009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00100000a linked-bytes=90
  nop                                        ; linked-va=0x7fe00100000b linked-bytes=90
  nop                                        ; linked-va=0x7fe00100000c linked-bytes=90
  nop                                        ; linked-va=0x7fe00100000d linked-bytes=90
  nop                                        ; linked-va=0x7fe00100000e linked-bytes=90
  nop                                        ; linked-va=0x7fe00100000f linked-bytes=90
  times 1024 - ($ - RtlImageNtHeader) db 0xcc
  times 4096 - ($ - $$) db 0xcc

section .rdata
; empty

section .data
; empty

section .bss
; empty
