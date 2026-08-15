; node.dll / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export relocation targets.
BITS 64
DEFAULT REL

global createJSProcess
global enterJSProcess
global terminateJSProcess

section .text
; bytes=4096; loader chooses the image base and RVA

; export=createJSProcess ordinal=0 binding=syscall
createJSProcess:
  mov eax, 0x9000                            ; linked-va=0x7fe008000000 linked-bytes=b8 00 90 00 00
  syscall                                    ; linked-va=0x7fe008000005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe008000007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe008000008 linked-bytes=90
  nop                                        ; linked-va=0x7fe008000009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00800000a linked-bytes=90
  nop                                        ; linked-va=0x7fe00800000b linked-bytes=90
  nop                                        ; linked-va=0x7fe00800000c linked-bytes=90
  nop                                        ; linked-va=0x7fe00800000d linked-bytes=90
  nop                                        ; linked-va=0x7fe00800000e linked-bytes=90
  nop                                        ; linked-va=0x7fe00800000f linked-bytes=90
  times 1024 - ($ - createJSProcess) db 0xcc

; export=enterJSProcess ordinal=1 binding=syscall
enterJSProcess:
  mov eax, 0x9001                            ; linked-va=0x7fe008000400 linked-bytes=b8 01 90 00 00
  syscall                                    ; linked-va=0x7fe008000405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe008000407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe008000408 linked-bytes=90
  nop                                        ; linked-va=0x7fe008000409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00800040a linked-bytes=90
  nop                                        ; linked-va=0x7fe00800040b linked-bytes=90
  nop                                        ; linked-va=0x7fe00800040c linked-bytes=90
  nop                                        ; linked-va=0x7fe00800040d linked-bytes=90
  nop                                        ; linked-va=0x7fe00800040e linked-bytes=90
  nop                                        ; linked-va=0x7fe00800040f linked-bytes=90
  times 1024 - ($ - enterJSProcess) db 0xcc

; export=terminateJSProcess ordinal=2 binding=syscall
terminateJSProcess:
  mov eax, 0x9002                            ; linked-va=0x7fe008000800 linked-bytes=b8 02 90 00 00
  syscall                                    ; linked-va=0x7fe008000805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe008000807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe008000808 linked-bytes=90
  nop                                        ; linked-va=0x7fe008000809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00800080a linked-bytes=90
  nop                                        ; linked-va=0x7fe00800080b linked-bytes=90
  nop                                        ; linked-va=0x7fe00800080c linked-bytes=90
  nop                                        ; linked-va=0x7fe00800080d linked-bytes=90
  nop                                        ; linked-va=0x7fe00800080e linked-bytes=90
  nop                                        ; linked-va=0x7fe00800080f linked-bytes=90
  times 1024 - ($ - terminateJSProcess) db 0xcc
  times 4096 - ($ - $$) db 0xcc

section .rdata
; empty

section .data
; empty

section .bss
; empty
