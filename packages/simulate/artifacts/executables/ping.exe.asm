; ping.exe / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export/data relocation targets.
BITS 64
DEFAULT REL

extern WSAStartup
extern socket
extern inet_addr
extern sendto
extern recvfrom
extern printf
extern closesocket
extern WSACleanup

global entry

section .text
; bytes=569; loader chooses the image base and RVA
entry:
  mov r13, 0xffffffffffffffff                ; linked-va=0x7ff600e01000 linked-bytes=49 bd ff ff ff ff ff ff ff ff
  cmp ecx, 0x1                               ; linked-va=0x7ff600e0100a linked-bytes=83 f9 01
  je near .loc_01f1                          ; linked-va=0x7ff600e0100d linked-bytes=0f 84 de 01 00 00
  mov r14, [rdx+0x8]                         ; linked-va=0x7ff600e01013 linked-bytes=4c 8b 72 08
  mov ecx, 0x202                             ; linked-va=0x7ff600e01017 linked-bytes=b9 02 02 00 00
  mov rdx, wsaData                           ; linked-va=0x7ff600e0101c linked-bytes=48 ba fb 31 e0 00 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff600e01026 linked-bytes=48 83 ec 20
  call WSAStartup                            ; linked-va=0x7ff600e0102a linked-bytes=ff 15 d0 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff600e01030 linked-bytes=48 83 c4 20
  test eax, eax                              ; linked-va=0x7ff600e01034 linked-bytes=85 c0
  jne near .loc_01c4                         ; linked-va=0x7ff600e01036 linked-bytes=0f 85 88 01 00 00
  mov ecx, 0x2                               ; linked-va=0x7ff600e0103c linked-bytes=b9 02 00 00 00
  mov edx, 0x3                               ; linked-va=0x7ff600e01041 linked-bytes=ba 03 00 00 00
  mov r8d, 0x1                               ; linked-va=0x7ff600e01046 linked-bytes=41 b8 01 00 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff600e0104c linked-bytes=48 83 ec 20
  call socket                                ; linked-va=0x7ff600e01050 linked-bytes=ff 15 b2 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff600e01056 linked-bytes=48 83 c4 20
  mov r13, rax                               ; linked-va=0x7ff600e0105a linked-bytes=4c 8b e8
  cmp rax, -0x1                              ; linked-va=0x7ff600e0105d linked-bytes=48 83 f8 ff
  je near .loc_01c4                          ; linked-va=0x7ff600e01061 linked-bytes=0f 84 5d 01 00 00
  mov rcx, r14                               ; linked-va=0x7ff600e01067 linked-bytes=49 8b ce
  sub rsp, 0x20                              ; linked-va=0x7ff600e0106a linked-bytes=48 83 ec 20
  call inet_addr                             ; linked-va=0x7ff600e0106e linked-bytes=ff 15 9c 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff600e01074 linked-bytes=48 83 c4 20
  cmp eax, -0x1                              ; linked-va=0x7ff600e01078 linked-bytes=83 f8 ff
  je near .loc_0178                          ; linked-va=0x7ff600e0107b linked-bytes=0f 84 f7 00 00 00
  mov rbx, sockaddr                          ; linked-va=0x7ff600e01081 linked-bytes=48 bb df 31 e0 00 f6 7f 00 00
  mov [rbx+0x4], eax                         ; linked-va=0x7ff600e0108b linked-bytes=89 43 04
  mov rcx, r13                               ; linked-va=0x7ff600e0108e linked-bytes=49 8b cd
  mov rdx, request                           ; linked-va=0x7ff600e01091 linked-bytes=48 ba ef 31 e0 00 f6 7f 00 00
  mov r8, 0x8                                ; linked-va=0x7ff600e0109b linked-bytes=49 b8 08 00 00 00 00 00 00 00
  xor r9, r9                                 ; linked-va=0x7ff600e010a5 linked-bytes=4d 31 c9
  push 0x10                                  ; linked-va=0x7ff600e010a8 linked-bytes=6a 10
  mov rax, sockaddr                          ; linked-va=0x7ff600e010aa linked-bytes=48 b8 df 31 e0 00 f6 7f 00 00
  push rax                                   ; linked-va=0x7ff600e010b4 linked-bytes=50
  sub rsp, 0x20                              ; linked-va=0x7ff600e010b5 linked-bytes=48 83 ec 20
  call sendto                                ; linked-va=0x7ff600e010b9 linked-bytes=ff 15 59 0f 00 00
  add rsp, 0x30                              ; linked-va=0x7ff600e010bf linked-bytes=48 83 c4 30
  cmp eax, -0x1                              ; linked-va=0x7ff600e010c3 linked-bytes=83 f8 ff
  je near .loc_019e                          ; linked-va=0x7ff600e010c6 linked-bytes=0f 84 d2 00 00 00
  mov rcx, r13                               ; linked-va=0x7ff600e010cc linked-bytes=49 8b cd
  mov rdx, reply                             ; linked-va=0x7ff600e010cf linked-bytes=48 ba 8b 33 e0 00 f6 7f 00 00
  mov r8, 0x40                               ; linked-va=0x7ff600e010d9 linked-bytes=49 b8 40 00 00 00 00 00 00 00
  xor r9, r9                                 ; linked-va=0x7ff600e010e3 linked-bytes=4d 31 c9
  mov rax, fromLength                        ; linked-va=0x7ff600e010e6 linked-bytes=48 b8 f7 31 e0 00 f6 7f 00 00
  push rax                                   ; linked-va=0x7ff600e010f0 linked-bytes=50
  mov rax, from                              ; linked-va=0x7ff600e010f1 linked-bytes=48 b8 cb 33 e0 00 f6 7f 00 00
  push rax                                   ; linked-va=0x7ff600e010fb linked-bytes=50
  sub rsp, 0x20                              ; linked-va=0x7ff600e010fc linked-bytes=48 83 ec 20
  call recvfrom                              ; linked-va=0x7ff600e01100 linked-bytes=ff 15 1a 0f 00 00
  add rsp, 0x30                              ; linked-va=0x7ff600e01106 linked-bytes=48 83 c4 30
  cmp eax, -0x1                              ; linked-va=0x7ff600e0110a linked-bytes=83 f8 ff
  je near .loc_019e                          ; linked-va=0x7ff600e0110d linked-bytes=0f 84 8b 00 00 00
  call .loc_0219                             ; linked-va=0x7ff600e01113 linked-bytes=e8 01 01 00 00
  mov rdx, r14                               ; linked-va=0x7ff600e01118 linked-bytes=49 8b d6
  mov r8d, 0x8                               ; linked-va=0x7ff600e0111b linked-bytes=41 b8 08 00 00 00
  mov rcx, pingFormat                        ; linked-va=0x7ff600e01121 linked-bytes=48 b9 1a 30 e0 00 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff600e0112b linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff600e0112f linked-bytes=ff 15 f3 0e 00 00
  add rsp, 0x20                              ; linked-va=0x7ff600e01135 linked-bytes=48 83 c4 20
  mov rdx, r14                               ; linked-va=0x7ff600e01139 linked-bytes=49 8b d6
  mov r8d, 0x8                               ; linked-va=0x7ff600e0113c linked-bytes=41 b8 08 00 00 00
  mov rcx, replyFormat                       ; linked-va=0x7ff600e01142 linked-bytes=48 b9 40 30 e0 00 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff600e0114c linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff600e01150 linked-bytes=ff 15 d2 0e 00 00
  add rsp, 0x20                              ; linked-va=0x7ff600e01156 linked-bytes=48 83 c4 20
  mov rdx, r14                               ; linked-va=0x7ff600e0115a linked-bytes=49 8b d6
  mov rcx, statisticsFormat                  ; linked-va=0x7ff600e0115d linked-bytes=48 b9 6d 30 e0 00 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff600e01167 linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff600e0116b linked-bytes=ff 15 b7 0e 00 00
  add rsp, 0x20                              ; linked-va=0x7ff600e01171 linked-bytes=48 83 c4 20
  xor eax, eax                               ; linked-va=0x7ff600e01175 linked-bytes=31 c0
  ret                                        ; linked-va=0x7ff600e01177 linked-bytes=c3
.loc_0178:
  call .loc_0219                             ; linked-va=0x7ff600e01178 linked-bytes=e8 9c 00 00 00
  mov rdx, r14                               ; linked-va=0x7ff600e0117d linked-bytes=49 8b d6
  mov rcx, invalidFormat                     ; linked-va=0x7ff600e01180 linked-bytes=48 b9 52 31 e0 00 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff600e0118a linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff600e0118e linked-bytes=ff 15 94 0e 00 00
  add rsp, 0x20                              ; linked-va=0x7ff600e01194 linked-bytes=48 83 c4 20
  mov eax, 0x1                               ; linked-va=0x7ff600e01198 linked-bytes=b8 01 00 00 00
  ret                                        ; linked-va=0x7ff600e0119d linked-bytes=c3
.loc_019e:
  call .loc_0219                             ; linked-va=0x7ff600e0119e linked-bytes=e8 76 00 00 00
  mov rdx, r14                               ; linked-va=0x7ff600e011a3 linked-bytes=49 8b d6
  mov rcx, blockedFormat                     ; linked-va=0x7ff600e011a6 linked-bytes=48 b9 c2 30 e0 00 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff600e011b0 linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff600e011b4 linked-bytes=ff 15 6e 0e 00 00
  add rsp, 0x20                              ; linked-va=0x7ff600e011ba linked-bytes=48 83 c4 20
  mov eax, 0x1                               ; linked-va=0x7ff600e011be linked-bytes=b8 01 00 00 00
  ret                                        ; linked-va=0x7ff600e011c3 linked-bytes=c3
.loc_01c4:
  call .loc_0219                             ; linked-va=0x7ff600e011c4 linked-bytes=e8 50 00 00 00
  mov rdx, winsockFailure                    ; linked-va=0x7ff600e011c9 linked-bytes=48 ba 9e 31 e0 00 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff600e011d3 linked-bytes=48 b9 dc 31 e0 00 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff600e011dd linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff600e011e1 linked-bytes=ff 15 41 0e 00 00
  add rsp, 0x20                              ; linked-va=0x7ff600e011e7 linked-bytes=48 83 c4 20
  mov eax, 0x1                               ; linked-va=0x7ff600e011eb linked-bytes=b8 01 00 00 00
  ret                                        ; linked-va=0x7ff600e011f0 linked-bytes=c3
.loc_01f1:
  mov rdx, usage                             ; linked-va=0x7ff600e011f1 linked-bytes=48 ba 00 30 e0 00 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff600e011fb linked-bytes=48 b9 dc 31 e0 00 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff600e01205 linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff600e01209 linked-bytes=ff 15 19 0e 00 00
  add rsp, 0x20                              ; linked-va=0x7ff600e0120f linked-bytes=48 83 c4 20
  mov eax, 0x1                               ; linked-va=0x7ff600e01213 linked-bytes=b8 01 00 00 00
  ret                                        ; linked-va=0x7ff600e01218 linked-bytes=c3
.loc_0219:
  mov rcx, r13                               ; linked-va=0x7ff600e01219 linked-bytes=49 8b cd
  sub rsp, 0x20                              ; linked-va=0x7ff600e0121c linked-bytes=48 83 ec 20
  call closesocket                           ; linked-va=0x7ff600e01220 linked-bytes=ff 15 0a 0e 00 00
  add rsp, 0x20                              ; linked-va=0x7ff600e01226 linked-bytes=48 83 c4 20
  sub rsp, 0x20                              ; linked-va=0x7ff600e0122a linked-bytes=48 83 ec 20
  call WSACleanup                            ; linked-va=0x7ff600e0122e linked-bytes=ff 15 04 0e 00 00
  add rsp, 0x20                              ; linked-va=0x7ff600e01234 linked-bytes=48 83 c4 20
  ret                                        ; linked-va=0x7ff600e01238 linked-bytes=c3

section .rdata
; bytes=479; linker chooses the section RVA

usage:
  ; utf8="Usage: ping target_name\r\n\u0000"
  db 0x55, 0x73, 0x61, 0x67, 0x65, 0x3a, 0x20, 0x70, 0x69, 0x6e, 0x67, 0x20, 0x74, 0x61, 0x72, 0x67
  db 0x65, 0x74, 0x5f, 0x6e, 0x61, 0x6d, 0x65, 0x0d, 0x0a, 0x00

pingFormat:
  ; utf8="\r\nPinging %s with %d bytes of data:\r\n\u0000"
  db 0x0d, 0x0a, 0x50, 0x69, 0x6e, 0x67, 0x69, 0x6e, 0x67, 0x20, 0x25, 0x73, 0x20, 0x77, 0x69, 0x74
  db 0x68, 0x20, 0x25, 0x64, 0x20, 0x62, 0x79, 0x74, 0x65, 0x73, 0x20, 0x6f, 0x66, 0x20, 0x64, 0x61
  db 0x74, 0x61, 0x3a, 0x0d, 0x0a, 0x00

replyFormat:
  ; utf8="Reply from %s: bytes=%d time<1ms TTL=128\r\n\r\n\u0000"
  db 0x52, 0x65, 0x70, 0x6c, 0x79, 0x20, 0x66, 0x72, 0x6f, 0x6d, 0x20, 0x25, 0x73, 0x3a, 0x20, 0x62
  db 0x79, 0x74, 0x65, 0x73, 0x3d, 0x25, 0x64, 0x20, 0x74, 0x69, 0x6d, 0x65, 0x3c, 0x31, 0x6d, 0x73
  db 0x20, 0x54, 0x54, 0x4c, 0x3d, 0x31, 0x32, 0x38, 0x0d, 0x0a, 0x0d, 0x0a, 0x00

statisticsFormat:
  ; utf8="Ping statistics for %s:\r\n    Packets: Sent = 1, Received = 1, Lost = 0 (0%% loss),\r\n\u0000"
  db 0x50, 0x69, 0x6e, 0x67, 0x20, 0x73, 0x74, 0x61, 0x74, 0x69, 0x73, 0x74, 0x69, 0x63, 0x73, 0x20
  db 0x66, 0x6f, 0x72, 0x20, 0x25, 0x73, 0x3a, 0x0d, 0x0a, 0x20, 0x20, 0x20, 0x20, 0x50, 0x61, 0x63
  db 0x6b, 0x65, 0x74, 0x73, 0x3a, 0x20, 0x53, 0x65, 0x6e, 0x74, 0x20, 0x3d, 0x20, 0x31, 0x2c, 0x20
  db 0x52, 0x65, 0x63, 0x65, 0x69, 0x76, 0x65, 0x64, 0x20, 0x3d, 0x20, 0x31, 0x2c, 0x20, 0x4c, 0x6f
  db 0x73, 0x74, 0x20, 0x3d, 0x20, 0x30, 0x20, 0x28, 0x30, 0x25, 0x25, 0x20, 0x6c, 0x6f, 0x73, 0x73
  db 0x29, 0x2c, 0x0d, 0x0a, 0x00

blockedFormat:
  ; utf8="PING: transmit failed. %s is outside the simulated loopback network.\r\nOnly 127.0.0.0/8 is routable; no host network connection was attempted.\r\n\u0000"
  db 0x50, 0x49, 0x4e, 0x47, 0x3a, 0x20, 0x74, 0x72, 0x61, 0x6e, 0x73, 0x6d, 0x69, 0x74, 0x20, 0x66
  db 0x61, 0x69, 0x6c, 0x65, 0x64, 0x2e, 0x20, 0x25, 0x73, 0x20, 0x69, 0x73, 0x20, 0x6f, 0x75, 0x74
  db 0x73, 0x69, 0x64, 0x65, 0x20, 0x74, 0x68, 0x65, 0x20, 0x73, 0x69, 0x6d, 0x75, 0x6c, 0x61, 0x74
  db 0x65, 0x64, 0x20, 0x6c, 0x6f, 0x6f, 0x70, 0x62, 0x61, 0x63, 0x6b, 0x20, 0x6e, 0x65, 0x74, 0x77
  db 0x6f, 0x72, 0x6b, 0x2e, 0x0d, 0x0a, 0x4f, 0x6e, 0x6c, 0x79, 0x20, 0x31, 0x32, 0x37, 0x2e, 0x30
  db 0x2e, 0x30, 0x2e, 0x30, 0x2f, 0x38, 0x20, 0x69, 0x73, 0x20, 0x72, 0x6f, 0x75, 0x74, 0x61, 0x62
  db 0x6c, 0x65, 0x3b, 0x20, 0x6e, 0x6f, 0x20, 0x68, 0x6f, 0x73, 0x74, 0x20, 0x6e, 0x65, 0x74, 0x77
  db 0x6f, 0x72, 0x6b, 0x20, 0x63, 0x6f, 0x6e, 0x6e, 0x65, 0x63, 0x74, 0x69, 0x6f, 0x6e, 0x20, 0x77
  db 0x61, 0x73, 0x20, 0x61, 0x74, 0x74, 0x65, 0x6d, 0x70, 0x74, 0x65, 0x64, 0x2e, 0x0d, 0x0a, 0x00

invalidFormat:
  ; utf8="Ping request could not find host %s. Please check the name and try again.\r\n\u0000"
  db 0x50, 0x69, 0x6e, 0x67, 0x20, 0x72, 0x65, 0x71, 0x75, 0x65, 0x73, 0x74, 0x20, 0x63, 0x6f, 0x75
  db 0x6c, 0x64, 0x20, 0x6e, 0x6f, 0x74, 0x20, 0x66, 0x69, 0x6e, 0x64, 0x20, 0x68, 0x6f, 0x73, 0x74
  db 0x20, 0x25, 0x73, 0x2e, 0x20, 0x50, 0x6c, 0x65, 0x61, 0x73, 0x65, 0x20, 0x63, 0x68, 0x65, 0x63
  db 0x6b, 0x20, 0x74, 0x68, 0x65, 0x20, 0x6e, 0x61, 0x6d, 0x65, 0x20, 0x61, 0x6e, 0x64, 0x20, 0x74
  db 0x72, 0x79, 0x20, 0x61, 0x67, 0x61, 0x69, 0x6e, 0x2e, 0x0d, 0x0a, 0x00

winsockFailure:
  ; utf8="PING: the simulated Winsock stack could not be initialized.\r\n\u0000"
  db 0x50, 0x49, 0x4e, 0x47, 0x3a, 0x20, 0x74, 0x68, 0x65, 0x20, 0x73, 0x69, 0x6d, 0x75, 0x6c, 0x61
  db 0x74, 0x65, 0x64, 0x20, 0x57, 0x69, 0x6e, 0x73, 0x6f, 0x63, 0x6b, 0x20, 0x73, 0x74, 0x61, 0x63
  db 0x6b, 0x20, 0x63, 0x6f, 0x75, 0x6c, 0x64, 0x20, 0x6e, 0x6f, 0x74, 0x20, 0x62, 0x65, 0x20, 0x69
  db 0x6e, 0x69, 0x74, 0x69, 0x61, 0x6c, 0x69, 0x7a, 0x65, 0x64, 0x2e, 0x0d, 0x0a, 0x00

__exoproc_printf_string_format:
  ; utf8="%s\u0000"
  db 0x25, 0x73, 0x00

section .data
; bytes=28; linker chooses the section RVA

sockaddr:
  db 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00

request:
  db 0x08, 0x00, 0x00, 0x00, 0x34, 0x12, 0x01, 0x00

fromLength:
  db 0x10, 0x00, 0x00, 0x00

section .bss
; bytes=480; linker chooses the section RVA

wsaData:
  resb 400

reply:
  resb 64

from:
  resb 16
