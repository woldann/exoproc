; advapi32.dll / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export relocation targets.
BITS 64
DEFAULT REL

global OpenProcessToken
global CreateRestrictedToken
global CreateProcessAsUserA

section .text
; bytes=4096; loader chooses the image base and RVA

; export=OpenProcessToken ordinal=0 binding=syscall
OpenProcessToken:
  mov eax, 0x6000                            ; linked-va=0x7fe005000000 linked-bytes=b8 00 60 00 00
  syscall                                    ; linked-va=0x7fe005000005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe005000007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe005000008 linked-bytes=90
  nop                                        ; linked-va=0x7fe005000009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00500000a linked-bytes=90
  nop                                        ; linked-va=0x7fe00500000b linked-bytes=90
  nop                                        ; linked-va=0x7fe00500000c linked-bytes=90
  nop                                        ; linked-va=0x7fe00500000d linked-bytes=90
  nop                                        ; linked-va=0x7fe00500000e linked-bytes=90
  nop                                        ; linked-va=0x7fe00500000f linked-bytes=90
  times 1024 - ($ - OpenProcessToken) db 0xcc

; export=CreateRestrictedToken ordinal=1 binding=syscall
CreateRestrictedToken:
  mov eax, 0x6001                            ; linked-va=0x7fe005000400 linked-bytes=b8 01 60 00 00
  syscall                                    ; linked-va=0x7fe005000405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe005000407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe005000408 linked-bytes=90
  nop                                        ; linked-va=0x7fe005000409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00500040a linked-bytes=90
  nop                                        ; linked-va=0x7fe00500040b linked-bytes=90
  nop                                        ; linked-va=0x7fe00500040c linked-bytes=90
  nop                                        ; linked-va=0x7fe00500040d linked-bytes=90
  nop                                        ; linked-va=0x7fe00500040e linked-bytes=90
  nop                                        ; linked-va=0x7fe00500040f linked-bytes=90
  times 1024 - ($ - CreateRestrictedToken) db 0xcc

; export=CreateProcessAsUserA ordinal=2 binding=syscall
CreateProcessAsUserA:
  mov eax, 0x6002                            ; linked-va=0x7fe005000800 linked-bytes=b8 02 60 00 00
  syscall                                    ; linked-va=0x7fe005000805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe005000807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe005000808 linked-bytes=90
  nop                                        ; linked-va=0x7fe005000809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00500080a linked-bytes=90
  nop                                        ; linked-va=0x7fe00500080b linked-bytes=90
  nop                                        ; linked-va=0x7fe00500080c linked-bytes=90
  nop                                        ; linked-va=0x7fe00500080d linked-bytes=90
  nop                                        ; linked-va=0x7fe00500080e linked-bytes=90
  nop                                        ; linked-va=0x7fe00500080f linked-bytes=90
  times 1024 - ($ - CreateProcessAsUserA) db 0xcc
  times 4096 - ($ - $$) db 0xcc

section .rdata
; empty

section .data
; empty

section .bss
; empty
