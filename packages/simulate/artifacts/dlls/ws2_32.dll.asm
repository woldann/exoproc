; ws2_32.dll / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export relocation targets.
BITS 64
DEFAULT REL

global WSAStartup
global WSACleanup
global WSAGetLastError
global socket
global closesocket
global bind
global send
global recv
global sendto
global recvfrom
global inet_addr
global htons
global htonl
global ntohs
global ntohl

section .text
; bytes=16384; loader chooses the image base and RVA

; export=WSAStartup ordinal=0 binding=syscall
WSAStartup:
  mov eax, 0x8000                            ; linked-va=0x7fe007000000 linked-bytes=b8 00 80 00 00
  syscall                                    ; linked-va=0x7fe007000005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe007000007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe007000008 linked-bytes=90
  nop                                        ; linked-va=0x7fe007000009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00700000a linked-bytes=90
  nop                                        ; linked-va=0x7fe00700000b linked-bytes=90
  nop                                        ; linked-va=0x7fe00700000c linked-bytes=90
  nop                                        ; linked-va=0x7fe00700000d linked-bytes=90
  nop                                        ; linked-va=0x7fe00700000e linked-bytes=90
  nop                                        ; linked-va=0x7fe00700000f linked-bytes=90
  times 1024 - ($ - WSAStartup) db 0xcc

; export=WSACleanup ordinal=1 binding=syscall
WSACleanup:
  mov eax, 0x8001                            ; linked-va=0x7fe007000400 linked-bytes=b8 01 80 00 00
  syscall                                    ; linked-va=0x7fe007000405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe007000407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe007000408 linked-bytes=90
  nop                                        ; linked-va=0x7fe007000409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00700040a linked-bytes=90
  nop                                        ; linked-va=0x7fe00700040b linked-bytes=90
  nop                                        ; linked-va=0x7fe00700040c linked-bytes=90
  nop                                        ; linked-va=0x7fe00700040d linked-bytes=90
  nop                                        ; linked-va=0x7fe00700040e linked-bytes=90
  nop                                        ; linked-va=0x7fe00700040f linked-bytes=90
  times 1024 - ($ - WSACleanup) db 0xcc

; export=WSAGetLastError ordinal=2 binding=syscall
WSAGetLastError:
  mov eax, 0x8002                            ; linked-va=0x7fe007000800 linked-bytes=b8 02 80 00 00
  syscall                                    ; linked-va=0x7fe007000805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe007000807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe007000808 linked-bytes=90
  nop                                        ; linked-va=0x7fe007000809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00700080a linked-bytes=90
  nop                                        ; linked-va=0x7fe00700080b linked-bytes=90
  nop                                        ; linked-va=0x7fe00700080c linked-bytes=90
  nop                                        ; linked-va=0x7fe00700080d linked-bytes=90
  nop                                        ; linked-va=0x7fe00700080e linked-bytes=90
  nop                                        ; linked-va=0x7fe00700080f linked-bytes=90
  times 1024 - ($ - WSAGetLastError) db 0xcc

; export=socket ordinal=3 binding=syscall
socket:
  mov eax, 0x8003                            ; linked-va=0x7fe007000c00 linked-bytes=b8 03 80 00 00
  syscall                                    ; linked-va=0x7fe007000c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe007000c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe007000c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe007000c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe007000c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe007000c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe007000c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe007000c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe007000c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe007000c0f linked-bytes=90
  times 1024 - ($ - socket) db 0xcc

; export=closesocket ordinal=4 binding=syscall
closesocket:
  mov eax, 0x8004                            ; linked-va=0x7fe007001000 linked-bytes=b8 04 80 00 00
  syscall                                    ; linked-va=0x7fe007001005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe007001007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe007001008 linked-bytes=90
  nop                                        ; linked-va=0x7fe007001009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00700100a linked-bytes=90
  nop                                        ; linked-va=0x7fe00700100b linked-bytes=90
  nop                                        ; linked-va=0x7fe00700100c linked-bytes=90
  nop                                        ; linked-va=0x7fe00700100d linked-bytes=90
  nop                                        ; linked-va=0x7fe00700100e linked-bytes=90
  nop                                        ; linked-va=0x7fe00700100f linked-bytes=90
  times 1024 - ($ - closesocket) db 0xcc

; export=bind ordinal=5 binding=syscall
bind:
  mov eax, 0x8005                            ; linked-va=0x7fe007001400 linked-bytes=b8 05 80 00 00
  syscall                                    ; linked-va=0x7fe007001405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe007001407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe007001408 linked-bytes=90
  nop                                        ; linked-va=0x7fe007001409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00700140a linked-bytes=90
  nop                                        ; linked-va=0x7fe00700140b linked-bytes=90
  nop                                        ; linked-va=0x7fe00700140c linked-bytes=90
  nop                                        ; linked-va=0x7fe00700140d linked-bytes=90
  nop                                        ; linked-va=0x7fe00700140e linked-bytes=90
  nop                                        ; linked-va=0x7fe00700140f linked-bytes=90
  times 1024 - ($ - bind) db 0xcc

; export=send ordinal=6 binding=syscall
send:
  mov eax, 0x8006                            ; linked-va=0x7fe007001800 linked-bytes=b8 06 80 00 00
  syscall                                    ; linked-va=0x7fe007001805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe007001807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe007001808 linked-bytes=90
  nop                                        ; linked-va=0x7fe007001809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00700180a linked-bytes=90
  nop                                        ; linked-va=0x7fe00700180b linked-bytes=90
  nop                                        ; linked-va=0x7fe00700180c linked-bytes=90
  nop                                        ; linked-va=0x7fe00700180d linked-bytes=90
  nop                                        ; linked-va=0x7fe00700180e linked-bytes=90
  nop                                        ; linked-va=0x7fe00700180f linked-bytes=90
  times 1024 - ($ - send) db 0xcc

; export=recv ordinal=7 binding=syscall
recv:
  mov eax, 0x8007                            ; linked-va=0x7fe007001c00 linked-bytes=b8 07 80 00 00
  syscall                                    ; linked-va=0x7fe007001c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe007001c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe007001c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe007001c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe007001c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe007001c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe007001c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe007001c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe007001c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe007001c0f linked-bytes=90
  times 1024 - ($ - recv) db 0xcc

; export=sendto ordinal=8 binding=syscall
sendto:
  mov eax, 0x8008                            ; linked-va=0x7fe007002000 linked-bytes=b8 08 80 00 00
  syscall                                    ; linked-va=0x7fe007002005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe007002007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe007002008 linked-bytes=90
  nop                                        ; linked-va=0x7fe007002009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00700200a linked-bytes=90
  nop                                        ; linked-va=0x7fe00700200b linked-bytes=90
  nop                                        ; linked-va=0x7fe00700200c linked-bytes=90
  nop                                        ; linked-va=0x7fe00700200d linked-bytes=90
  nop                                        ; linked-va=0x7fe00700200e linked-bytes=90
  nop                                        ; linked-va=0x7fe00700200f linked-bytes=90
  times 1024 - ($ - sendto) db 0xcc

; export=recvfrom ordinal=9 binding=syscall
recvfrom:
  mov eax, 0x8009                            ; linked-va=0x7fe007002400 linked-bytes=b8 09 80 00 00
  syscall                                    ; linked-va=0x7fe007002405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe007002407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe007002408 linked-bytes=90
  nop                                        ; linked-va=0x7fe007002409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00700240a linked-bytes=90
  nop                                        ; linked-va=0x7fe00700240b linked-bytes=90
  nop                                        ; linked-va=0x7fe00700240c linked-bytes=90
  nop                                        ; linked-va=0x7fe00700240d linked-bytes=90
  nop                                        ; linked-va=0x7fe00700240e linked-bytes=90
  nop                                        ; linked-va=0x7fe00700240f linked-bytes=90
  times 1024 - ($ - recvfrom) db 0xcc

; export=inet_addr ordinal=10 binding=syscall
inet_addr:
  mov eax, 0x800a                            ; linked-va=0x7fe007002800 linked-bytes=b8 0a 80 00 00
  syscall                                    ; linked-va=0x7fe007002805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe007002807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe007002808 linked-bytes=90
  nop                                        ; linked-va=0x7fe007002809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00700280a linked-bytes=90
  nop                                        ; linked-va=0x7fe00700280b linked-bytes=90
  nop                                        ; linked-va=0x7fe00700280c linked-bytes=90
  nop                                        ; linked-va=0x7fe00700280d linked-bytes=90
  nop                                        ; linked-va=0x7fe00700280e linked-bytes=90
  nop                                        ; linked-va=0x7fe00700280f linked-bytes=90
  times 1024 - ($ - inet_addr) db 0xcc

; export=htons ordinal=11 binding=syscall
htons:
  mov eax, 0x800b                            ; linked-va=0x7fe007002c00 linked-bytes=b8 0b 80 00 00
  syscall                                    ; linked-va=0x7fe007002c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe007002c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe007002c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe007002c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe007002c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe007002c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe007002c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe007002c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe007002c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe007002c0f linked-bytes=90
  times 1024 - ($ - htons) db 0xcc

; export=htonl ordinal=12 binding=syscall
htonl:
  mov eax, 0x800c                            ; linked-va=0x7fe007003000 linked-bytes=b8 0c 80 00 00
  syscall                                    ; linked-va=0x7fe007003005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe007003007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe007003008 linked-bytes=90
  nop                                        ; linked-va=0x7fe007003009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00700300a linked-bytes=90
  nop                                        ; linked-va=0x7fe00700300b linked-bytes=90
  nop                                        ; linked-va=0x7fe00700300c linked-bytes=90
  nop                                        ; linked-va=0x7fe00700300d linked-bytes=90
  nop                                        ; linked-va=0x7fe00700300e linked-bytes=90
  nop                                        ; linked-va=0x7fe00700300f linked-bytes=90
  times 1024 - ($ - htonl) db 0xcc

; export=ntohs ordinal=13 binding=syscall
ntohs:
  mov eax, 0x800d                            ; linked-va=0x7fe007003400 linked-bytes=b8 0d 80 00 00
  syscall                                    ; linked-va=0x7fe007003405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe007003407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe007003408 linked-bytes=90
  nop                                        ; linked-va=0x7fe007003409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00700340a linked-bytes=90
  nop                                        ; linked-va=0x7fe00700340b linked-bytes=90
  nop                                        ; linked-va=0x7fe00700340c linked-bytes=90
  nop                                        ; linked-va=0x7fe00700340d linked-bytes=90
  nop                                        ; linked-va=0x7fe00700340e linked-bytes=90
  nop                                        ; linked-va=0x7fe00700340f linked-bytes=90
  times 1024 - ($ - ntohs) db 0xcc

; export=ntohl ordinal=14 binding=syscall
ntohl:
  mov eax, 0x800e                            ; linked-va=0x7fe007003800 linked-bytes=b8 0e 80 00 00
  syscall                                    ; linked-va=0x7fe007003805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe007003807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe007003808 linked-bytes=90
  nop                                        ; linked-va=0x7fe007003809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00700380a linked-bytes=90
  nop                                        ; linked-va=0x7fe00700380b linked-bytes=90
  nop                                        ; linked-va=0x7fe00700380c linked-bytes=90
  nop                                        ; linked-va=0x7fe00700380d linked-bytes=90
  nop                                        ; linked-va=0x7fe00700380e linked-bytes=90
  nop                                        ; linked-va=0x7fe00700380f linked-bytes=90
  times 1024 - ($ - ntohl) db 0xcc
  times 16384 - ($ - $$) db 0xcc

section .rdata
; empty

section .data
; empty

section .bss
; empty
