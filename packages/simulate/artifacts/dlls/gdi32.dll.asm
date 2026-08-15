; gdi32.dll / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export relocation targets.
BITS 64
DEFAULT REL

global GetStockObject
global SetTextColor
global SetBkMode
global SetBkColor
global CreateSolidBrush
global DeleteObject
global SelectObject
global Ellipse

section .text
; bytes=8192; loader chooses the image base and RVA

; export=GetStockObject ordinal=0 binding=syscall
GetStockObject:
  mov eax, 0x5000                            ; linked-va=0x7fe004000000 linked-bytes=b8 00 50 00 00
  syscall                                    ; linked-va=0x7fe004000005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe004000007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe004000008 linked-bytes=90
  nop                                        ; linked-va=0x7fe004000009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00400000a linked-bytes=90
  nop                                        ; linked-va=0x7fe00400000b linked-bytes=90
  nop                                        ; linked-va=0x7fe00400000c linked-bytes=90
  nop                                        ; linked-va=0x7fe00400000d linked-bytes=90
  nop                                        ; linked-va=0x7fe00400000e linked-bytes=90
  nop                                        ; linked-va=0x7fe00400000f linked-bytes=90
  times 1024 - ($ - GetStockObject) db 0xcc

; export=SetTextColor ordinal=1 binding=syscall
SetTextColor:
  mov eax, 0x5001                            ; linked-va=0x7fe004000400 linked-bytes=b8 01 50 00 00
  syscall                                    ; linked-va=0x7fe004000405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe004000407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe004000408 linked-bytes=90
  nop                                        ; linked-va=0x7fe004000409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00400040a linked-bytes=90
  nop                                        ; linked-va=0x7fe00400040b linked-bytes=90
  nop                                        ; linked-va=0x7fe00400040c linked-bytes=90
  nop                                        ; linked-va=0x7fe00400040d linked-bytes=90
  nop                                        ; linked-va=0x7fe00400040e linked-bytes=90
  nop                                        ; linked-va=0x7fe00400040f linked-bytes=90
  times 1024 - ($ - SetTextColor) db 0xcc

; export=SetBkMode ordinal=2 binding=syscall
SetBkMode:
  mov eax, 0x5002                            ; linked-va=0x7fe004000800 linked-bytes=b8 02 50 00 00
  syscall                                    ; linked-va=0x7fe004000805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe004000807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe004000808 linked-bytes=90
  nop                                        ; linked-va=0x7fe004000809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00400080a linked-bytes=90
  nop                                        ; linked-va=0x7fe00400080b linked-bytes=90
  nop                                        ; linked-va=0x7fe00400080c linked-bytes=90
  nop                                        ; linked-va=0x7fe00400080d linked-bytes=90
  nop                                        ; linked-va=0x7fe00400080e linked-bytes=90
  nop                                        ; linked-va=0x7fe00400080f linked-bytes=90
  times 1024 - ($ - SetBkMode) db 0xcc

; export=SetBkColor ordinal=3 binding=syscall
SetBkColor:
  mov eax, 0x5003                            ; linked-va=0x7fe004000c00 linked-bytes=b8 03 50 00 00
  syscall                                    ; linked-va=0x7fe004000c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe004000c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe004000c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe004000c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe004000c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe004000c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe004000c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe004000c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe004000c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe004000c0f linked-bytes=90
  times 1024 - ($ - SetBkColor) db 0xcc

; export=CreateSolidBrush ordinal=4 binding=syscall
CreateSolidBrush:
  mov eax, 0x5004                            ; linked-va=0x7fe004001000 linked-bytes=b8 04 50 00 00
  syscall                                    ; linked-va=0x7fe004001005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe004001007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe004001008 linked-bytes=90
  nop                                        ; linked-va=0x7fe004001009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00400100a linked-bytes=90
  nop                                        ; linked-va=0x7fe00400100b linked-bytes=90
  nop                                        ; linked-va=0x7fe00400100c linked-bytes=90
  nop                                        ; linked-va=0x7fe00400100d linked-bytes=90
  nop                                        ; linked-va=0x7fe00400100e linked-bytes=90
  nop                                        ; linked-va=0x7fe00400100f linked-bytes=90
  times 1024 - ($ - CreateSolidBrush) db 0xcc

; export=DeleteObject ordinal=5 binding=syscall
DeleteObject:
  mov eax, 0x5005                            ; linked-va=0x7fe004001400 linked-bytes=b8 05 50 00 00
  syscall                                    ; linked-va=0x7fe004001405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe004001407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe004001408 linked-bytes=90
  nop                                        ; linked-va=0x7fe004001409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00400140a linked-bytes=90
  nop                                        ; linked-va=0x7fe00400140b linked-bytes=90
  nop                                        ; linked-va=0x7fe00400140c linked-bytes=90
  nop                                        ; linked-va=0x7fe00400140d linked-bytes=90
  nop                                        ; linked-va=0x7fe00400140e linked-bytes=90
  nop                                        ; linked-va=0x7fe00400140f linked-bytes=90
  times 1024 - ($ - DeleteObject) db 0xcc

; export=SelectObject ordinal=6 binding=syscall
SelectObject:
  mov eax, 0x5006                            ; linked-va=0x7fe004001800 linked-bytes=b8 06 50 00 00
  syscall                                    ; linked-va=0x7fe004001805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe004001807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe004001808 linked-bytes=90
  nop                                        ; linked-va=0x7fe004001809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00400180a linked-bytes=90
  nop                                        ; linked-va=0x7fe00400180b linked-bytes=90
  nop                                        ; linked-va=0x7fe00400180c linked-bytes=90
  nop                                        ; linked-va=0x7fe00400180d linked-bytes=90
  nop                                        ; linked-va=0x7fe00400180e linked-bytes=90
  nop                                        ; linked-va=0x7fe00400180f linked-bytes=90
  times 1024 - ($ - SelectObject) db 0xcc

; export=Ellipse ordinal=7 binding=syscall
Ellipse:
  mov eax, 0x5007                            ; linked-va=0x7fe004001c00 linked-bytes=b8 07 50 00 00
  syscall                                    ; linked-va=0x7fe004001c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe004001c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe004001c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe004001c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe004001c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe004001c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe004001c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe004001c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe004001c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe004001c0f linked-bytes=90
  times 1024 - ($ - Ellipse) db 0xcc
  times 8192 - ($ - $$) db 0xcc

section .rdata
; empty

section .data
; empty

section .bss
; empty
