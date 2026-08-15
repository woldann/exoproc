; whois.exe / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export/data relocation targets.
BITS 64
DEFAULT REL

extern inet_addr
extern printf
extern strlen

global entry

section .text
; bytes=376; loader chooses the image base and RVA
entry:
  cmp ecx, 0x1                               ; linked-va=0x7ff601a01000 linked-bytes=83 f9 01
  je near .loc_0120                          ; linked-va=0x7ff601a01003 linked-bytes=0f 84 17 01 00 00
  mov rax, rdx                               ; linked-va=0x7ff601a01009 linked-bytes=48 8b c2
  mov r14, [rax+0x8]                         ; linked-va=0x7ff601a0100c linked-bytes=4c 8b 70 08
  mov rcx, r14                               ; linked-va=0x7ff601a01010 linked-bytes=49 8b ce
  sub rsp, 0x20                              ; linked-va=0x7ff601a01013 linked-bytes=48 83 ec 20
  call inet_addr                             ; linked-va=0x7ff601a01017 linked-bytes=ff 15 e3 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff601a0101d linked-bytes=48 83 c4 20
  cmp eax, -0x1                              ; linked-va=0x7ff601a01021 linked-bytes=83 f8 ff
  je near .loc_00d1                          ; linked-va=0x7ff601a01024 linked-bytes=0f 84 a7 00 00 00
  cmp eax, 0x100007f                         ; linked-va=0x7ff601a0102a linked-bytes=81 f8 7f 00 00 01
  jne near .loc_0082                         ; linked-va=0x7ff601a01030 linked-bytes=0f 85 4c 00 00 00
  mov rdx, localRecord                       ; linked-va=0x7ff601a01036 linked-bytes=48 ba 17 30 a0 01 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff601a01040 linked-bytes=48 b9 65 31 a0 01 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff601a0104a linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff601a0104e linked-bytes=ff 15 b4 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff601a01054 linked-bytes=48 83 c4 20
  call .loc_0148                             ; linked-va=0x7ff601a01058 linked-bytes=e8 eb 00 00 00
  mov rdx, newline                           ; linked-va=0x7ff601a0105d linked-bytes=48 ba 62 31 a0 01 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff601a01067 linked-bytes=48 b9 65 31 a0 01 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff601a01071 linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff601a01075 linked-bytes=ff 15 8d 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff601a0107b linked-bytes=48 83 c4 20
  xor eax, eax                               ; linked-va=0x7ff601a0107f linked-bytes=31 c0
  ret                                        ; linked-va=0x7ff601a01081 linked-bytes=c3
.loc_0082:
  mov rdx, blockedPrefix                     ; linked-va=0x7ff601a01082 linked-bytes=48 ba b8 30 a0 01 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff601a0108c linked-bytes=48 b9 65 31 a0 01 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff601a01096 linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff601a0109a linked-bytes=ff 15 68 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff601a010a0 linked-bytes=48 83 c4 20
  call .loc_0148                             ; linked-va=0x7ff601a010a4 linked-bytes=e8 9f 00 00 00
  mov rdx, blockedSuffix                     ; linked-va=0x7ff601a010a9 linked-bytes=48 ba d2 30 a0 01 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff601a010b3 linked-bytes=48 b9 65 31 a0 01 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff601a010bd linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff601a010c1 linked-bytes=ff 15 41 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff601a010c7 linked-bytes=48 83 c4 20
  mov eax, 0x1                               ; linked-va=0x7ff601a010cb linked-bytes=b8 01 00 00 00
  ret                                        ; linked-va=0x7ff601a010d0 linked-bytes=c3
.loc_00d1:
  mov rdx, invalidPrefix                     ; linked-va=0x7ff601a010d1 linked-bytes=48 ba 2c 31 a0 01 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff601a010db linked-bytes=48 b9 65 31 a0 01 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff601a010e5 linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff601a010e9 linked-bytes=ff 15 19 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff601a010ef linked-bytes=48 83 c4 20
  call .loc_0148                             ; linked-va=0x7ff601a010f3 linked-bytes=e8 50 00 00 00
  mov rdx, invalidSuffix                     ; linked-va=0x7ff601a010f8 linked-bytes=48 ba 42 31 a0 01 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff601a01102 linked-bytes=48 b9 65 31 a0 01 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff601a0110c linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff601a01110 linked-bytes=ff 15 f2 0e 00 00
  add rsp, 0x20                              ; linked-va=0x7ff601a01116 linked-bytes=48 83 c4 20
  mov eax, 0x1                               ; linked-va=0x7ff601a0111a linked-bytes=b8 01 00 00 00
  ret                                        ; linked-va=0x7ff601a0111f linked-bytes=c3
.loc_0120:
  mov rdx, usage                             ; linked-va=0x7ff601a01120 linked-bytes=48 ba 00 30 a0 01 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff601a0112a linked-bytes=48 b9 65 31 a0 01 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff601a01134 linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff601a01138 linked-bytes=ff 15 ca 0e 00 00
  add rsp, 0x20                              ; linked-va=0x7ff601a0113e linked-bytes=48 83 c4 20
  mov eax, 0x1                               ; linked-va=0x7ff601a01142 linked-bytes=b8 01 00 00 00
  ret                                        ; linked-va=0x7ff601a01147 linked-bytes=c3
.loc_0148:
  mov rcx, r14                               ; linked-va=0x7ff601a01148 linked-bytes=49 8b ce
  sub rsp, 0x20                              ; linked-va=0x7ff601a0114b linked-bytes=48 83 ec 20
  call strlen                                ; linked-va=0x7ff601a0114f linked-bytes=ff 15 bb 0e 00 00
  add rsp, 0x20                              ; linked-va=0x7ff601a01155 linked-bytes=48 83 c4 20
  mov r8, rax                                ; linked-va=0x7ff601a01159 linked-bytes=4c 8b c0
  mov rdx, r14                               ; linked-va=0x7ff601a0115c linked-bytes=49 8b d6
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff601a0115f linked-bytes=48 b9 65 31 a0 01 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff601a01169 linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff601a0116d linked-bytes=ff 15 95 0e 00 00
  add rsp, 0x20                              ; linked-va=0x7ff601a01173 linked-bytes=48 83 c4 20
  ret                                        ; linked-va=0x7ff601a01177 linked-bytes=c3

section .rdata
; bytes=360; linker chooses the section RVA

usage:
  ; utf8="Usage: whois address\r\n\u0000"
  db 0x55, 0x73, 0x61, 0x67, 0x65, 0x3a, 0x20, 0x77, 0x68, 0x6f, 0x69, 0x73, 0x20, 0x61, 0x64, 0x64
  db 0x72, 0x65, 0x73, 0x73, 0x0d, 0x0a, 0x00

localRecord:
  ; utf8="NetRange:       127.0.0.0 - 127.255.255.255\r\nCIDR:           127.0.0.0/8\r\nNetName:        EXOPROC-LOOPBACK\r\nNetType:        Simulated Loopback\r\nQuery:          \u0000"
  db 0x4e, 0x65, 0x74, 0x52, 0x61, 0x6e, 0x67, 0x65, 0x3a, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20
  db 0x31, 0x32, 0x37, 0x2e, 0x30, 0x2e, 0x30, 0x2e, 0x30, 0x20, 0x2d, 0x20, 0x31, 0x32, 0x37, 0x2e
  db 0x32, 0x35, 0x35, 0x2e, 0x32, 0x35, 0x35, 0x2e, 0x32, 0x35, 0x35, 0x0d, 0x0a, 0x43, 0x49, 0x44
  db 0x52, 0x3a, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x31, 0x32, 0x37
  db 0x2e, 0x30, 0x2e, 0x30, 0x2e, 0x30, 0x2f, 0x38, 0x0d, 0x0a, 0x4e, 0x65, 0x74, 0x4e, 0x61, 0x6d
  db 0x65, 0x3a, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x45, 0x58, 0x4f, 0x50, 0x52, 0x4f
  db 0x43, 0x2d, 0x4c, 0x4f, 0x4f, 0x50, 0x42, 0x41, 0x43, 0x4b, 0x0d, 0x0a, 0x4e, 0x65, 0x74, 0x54
  db 0x79, 0x70, 0x65, 0x3a, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x53, 0x69, 0x6d, 0x75
  db 0x6c, 0x61, 0x74, 0x65, 0x64, 0x20, 0x4c, 0x6f, 0x6f, 0x70, 0x62, 0x61, 0x63, 0x6b, 0x0d, 0x0a
  db 0x51, 0x75, 0x65, 0x72, 0x79, 0x3a, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20
  db 0x00

blockedPrefix:
  ; utf8="WHOIS lookup blocked for \u0000"
  db 0x57, 0x48, 0x4f, 0x49, 0x53, 0x20, 0x6c, 0x6f, 0x6f, 0x6b, 0x75, 0x70, 0x20, 0x62, 0x6c, 0x6f
  db 0x63, 0x6b, 0x65, 0x64, 0x20, 0x66, 0x6f, 0x72, 0x20, 0x00

blockedSuffix:
  ; utf8=".\r\nOnly the simulated 127.0.0.0/8 registry is available.\r\nNo internet request was made.\r\n\u0000"
  db 0x2e, 0x0d, 0x0a, 0x4f, 0x6e, 0x6c, 0x79, 0x20, 0x74, 0x68, 0x65, 0x20, 0x73, 0x69, 0x6d, 0x75
  db 0x6c, 0x61, 0x74, 0x65, 0x64, 0x20, 0x31, 0x32, 0x37, 0x2e, 0x30, 0x2e, 0x30, 0x2e, 0x30, 0x2f
  db 0x38, 0x20, 0x72, 0x65, 0x67, 0x69, 0x73, 0x74, 0x72, 0x79, 0x20, 0x69, 0x73, 0x20, 0x61, 0x76
  db 0x61, 0x69, 0x6c, 0x61, 0x62, 0x6c, 0x65, 0x2e, 0x0d, 0x0a, 0x4e, 0x6f, 0x20, 0x69, 0x6e, 0x74
  db 0x65, 0x72, 0x6e, 0x65, 0x74, 0x20, 0x72, 0x65, 0x71, 0x75, 0x65, 0x73, 0x74, 0x20, 0x77, 0x61
  db 0x73, 0x20, 0x6d, 0x61, 0x64, 0x65, 0x2e, 0x0d, 0x0a, 0x00

invalidPrefix:
  ; utf8="WHOIS lookup failed: \u0000"
  db 0x57, 0x48, 0x4f, 0x49, 0x53, 0x20, 0x6c, 0x6f, 0x6f, 0x6b, 0x75, 0x70, 0x20, 0x66, 0x61, 0x69
  db 0x6c, 0x65, 0x64, 0x3a, 0x20, 0x00

invalidSuffix:
  ; utf8=" is not a local IPv4 address.\r\n\u0000"
  db 0x20, 0x69, 0x73, 0x20, 0x6e, 0x6f, 0x74, 0x20, 0x61, 0x20, 0x6c, 0x6f, 0x63, 0x61, 0x6c, 0x20
  db 0x49, 0x50, 0x76, 0x34, 0x20, 0x61, 0x64, 0x64, 0x72, 0x65, 0x73, 0x73, 0x2e, 0x0d, 0x0a, 0x00

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
