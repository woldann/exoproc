; cmd.exe / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export/data relocation targets.
BITS 64
DEFAULT REL

extern GetStdHandle
extern WriteFile
extern GetCurrentDirectoryA
extern ReadFile
extern CreateProcessA
extern WaitForSingleObject
extern GetExitCodeProcess
extern CloseHandle

global entry

section .text
; bytes=534; loader chooses the image base and RVA
entry:
  mov ecx, 0xfffffff5                        ; linked-va=0x7ff603a01000 linked-bytes=b9 f5 ff ff ff
  sub rsp, 0x20                              ; linked-va=0x7ff603a01005 linked-bytes=48 83 ec 20
  call GetStdHandle                          ; linked-va=0x7ff603a01009 linked-bytes=ff 15 f1 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603a0100f linked-bytes=48 83 c4 20
  mov r15, rax                               ; linked-va=0x7ff603a01013 linked-bytes=4c 8b f8
  mov ecx, 0xfffffff6                        ; linked-va=0x7ff603a01016 linked-bytes=b9 f6 ff ff ff
  sub rsp, 0x20                              ; linked-va=0x7ff603a0101b linked-bytes=48 83 ec 20
  call GetStdHandle                          ; linked-va=0x7ff603a0101f linked-bytes=ff 15 db 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603a01025 linked-bytes=48 83 c4 20
  mov r14, rax                               ; linked-va=0x7ff603a01029 linked-bytes=4c 8b f0
  mov rdx, banner                            ; linked-va=0x7ff603a0102c linked-bytes=48 ba 00 30 a0 03 f6 7f 00 00
  mov r8, 0x60                               ; linked-va=0x7ff603a01036 linked-bytes=49 b8 60 00 00 00 00 00 00 00
  call .loc_0067                             ; linked-va=0x7ff603a01040 linked-bytes=e8 22 00 00 00
.loc_0045:
  call .loc_0085                             ; linked-va=0x7ff603a01045 linked-bytes=e8 3b 00 00 00
  call .loc_00ce                             ; linked-va=0x7ff603a0104a linked-bytes=e8 7f 00 00 00
  call .loc_0100                             ; linked-va=0x7ff603a0104f linked-bytes=e8 ac 00 00 00
  test rax, rax                              ; linked-va=0x7ff603a01054 linked-bytes=48 85 c0
  jne near .loc_0062                         ; linked-va=0x7ff603a01057 linked-bytes=0f 85 05 00 00 00
  call .loc_01c3                             ; linked-va=0x7ff603a0105d linked-bytes=e8 61 01 00 00
.loc_0062:
  jmp near .loc_0045                         ; linked-va=0x7ff603a01062 linked-bytes=e9 de ff ff ff
.loc_0067:
  mov rcx, r15                               ; linked-va=0x7ff603a01067 linked-bytes=49 8b cf
  mov r9, writtenCount                       ; linked-va=0x7ff603a0106a linked-bytes=49 b9 c8 40 a0 03 f6 7f 00 00
  push 0x0                                   ; linked-va=0x7ff603a01074 linked-bytes=6a 00
  sub rsp, 0x20                              ; linked-va=0x7ff603a01076 linked-bytes=48 83 ec 20
  call WriteFile                             ; linked-va=0x7ff603a0107a linked-bytes=ff 15 88 0f 00 00
  add rsp, 0x28                              ; linked-va=0x7ff603a01080 linked-bytes=48 83 c4 28
  ret                                        ; linked-va=0x7ff603a01084 linked-bytes=c3
.loc_0085:
  mov ecx, 0x104                             ; linked-va=0x7ff603a01085 linked-bytes=b9 04 01 00 00
  mov rdx, currentDirectory                  ; linked-va=0x7ff603a0108a linked-bytes=48 ba d0 40 a0 03 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff603a01094 linked-bytes=48 83 ec 20
  call GetCurrentDirectoryA                  ; linked-va=0x7ff603a01098 linked-bytes=ff 15 72 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603a0109e linked-bytes=48 83 c4 20
  mov r8, rax                                ; linked-va=0x7ff603a010a2 linked-bytes=4c 8b c0
  mov rdx, currentDirectory                  ; linked-va=0x7ff603a010a5 linked-bytes=48 ba d0 40 a0 03 f6 7f 00 00
  call .loc_0067                             ; linked-va=0x7ff603a010af linked-bytes=e8 b3 ff ff ff
  mov rdx, prompt                            ; linked-va=0x7ff603a010b4 linked-bytes=48 ba 61 30 a0 03 f6 7f 00 00
  mov r8, 0x1                                ; linked-va=0x7ff603a010be linked-bytes=49 b8 01 00 00 00 00 00 00 00
  call .loc_0067                             ; linked-va=0x7ff603a010c8 linked-bytes=e8 9a ff ff ff
  ret                                        ; linked-va=0x7ff603a010cd linked-bytes=c3
.loc_00ce:
  mov rcx, r14                               ; linked-va=0x7ff603a010ce linked-bytes=49 8b ce
  mov rdx, input                             ; linked-va=0x7ff603a010d1 linked-bytes=48 ba c0 30 a0 03 f6 7f 00 00
  mov r8, 0xfff                              ; linked-va=0x7ff603a010db linked-bytes=49 b8 ff 0f 00 00 00 00 00 00
  mov r9, readCount                          ; linked-va=0x7ff603a010e5 linked-bytes=49 b9 c0 40 a0 03 f6 7f 00 00
  push 0x0                                   ; linked-va=0x7ff603a010ef linked-bytes=6a 00
  sub rsp, 0x20                              ; linked-va=0x7ff603a010f1 linked-bytes=48 83 ec 20
  call ReadFile                              ; linked-va=0x7ff603a010f5 linked-bytes=ff 15 1d 0f 00 00
  add rsp, 0x28                              ; linked-va=0x7ff603a010fb linked-bytes=48 83 c4 28
  ret                                        ; linked-va=0x7ff603a010ff linked-bytes=c3
.loc_0100:
  xor rcx, rcx                               ; linked-va=0x7ff603a01100 linked-bytes=48 31 c9
  mov rdx, input                             ; linked-va=0x7ff603a01103 linked-bytes=48 ba c0 30 a0 03 f6 7f 00 00
  xor r8, r8                                 ; linked-va=0x7ff603a0110d linked-bytes=4d 31 c0
  xor r9, r9                                 ; linked-va=0x7ff603a01110 linked-bytes=4d 31 c9
  mov rax, processInformation                ; linked-va=0x7ff603a01113 linked-bytes=48 b8 d4 41 a0 03 f6 7f 00 00
  push rax                                   ; linked-va=0x7ff603a0111d linked-bytes=50
  push 0x0                                   ; linked-va=0x7ff603a0111e linked-bytes=6a 00
  push 0x0                                   ; linked-va=0x7ff603a01120 linked-bytes=6a 00
  push 0x0                                   ; linked-va=0x7ff603a01122 linked-bytes=6a 00
  push 0x0                                   ; linked-va=0x7ff603a01124 linked-bytes=6a 00
  push 0x1                                   ; linked-va=0x7ff603a01126 linked-bytes=6a 01
  sub rsp, 0x20                              ; linked-va=0x7ff603a01128 linked-bytes=48 83 ec 20
  call CreateProcessA                        ; linked-va=0x7ff603a0112c linked-bytes=ff 15 ee 0e 00 00
  add rsp, 0x50                              ; linked-va=0x7ff603a01132 linked-bytes=48 83 c4 50
  test eax, eax                              ; linked-va=0x7ff603a01136 linked-bytes=85 c0
  je near .loc_01c0                          ; linked-va=0x7ff603a01138 linked-bytes=0f 84 82 00 00 00
  mov rax, processInformation                ; linked-va=0x7ff603a0113e linked-bytes=48 b8 d4 41 a0 03 f6 7f 00 00
  mov rcx, [rax]                             ; linked-va=0x7ff603a01148 linked-bytes=48 8b 08
  mov edx, 0xffffffff                        ; linked-va=0x7ff603a0114b linked-bytes=ba ff ff ff ff
  sub rsp, 0x20                              ; linked-va=0x7ff603a01150 linked-bytes=48 83 ec 20
  call WaitForSingleObject                   ; linked-va=0x7ff603a01154 linked-bytes=ff 15 ce 0e 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603a0115a linked-bytes=48 83 c4 20
  mov rax, processInformation                ; linked-va=0x7ff603a0115e linked-bytes=48 b8 d4 41 a0 03 f6 7f 00 00
  mov rcx, [rax]                             ; linked-va=0x7ff603a01168 linked-bytes=48 8b 08
  mov rdx, childExitCode                     ; linked-va=0x7ff603a0116b linked-bytes=48 ba ec 41 a0 03 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff603a01175 linked-bytes=48 83 ec 20
  call GetExitCodeProcess                    ; linked-va=0x7ff603a01179 linked-bytes=ff 15 b1 0e 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603a0117f linked-bytes=48 83 c4 20
  mov rax, processInformation                ; linked-va=0x7ff603a01183 linked-bytes=48 b8 d4 41 a0 03 f6 7f 00 00
  mov rcx, [rax]                             ; linked-va=0x7ff603a0118d linked-bytes=48 8b 08
  sub rsp, 0x20                              ; linked-va=0x7ff603a01190 linked-bytes=48 83 ec 20
  call CloseHandle                           ; linked-va=0x7ff603a01194 linked-bytes=ff 15 9e 0e 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603a0119a linked-bytes=48 83 c4 20
  mov rax, processInformation                ; linked-va=0x7ff603a0119e linked-bytes=48 b8 d4 41 a0 03 f6 7f 00 00
  mov rcx, [rax+0x8]                         ; linked-va=0x7ff603a011a8 linked-bytes=48 8b 48 08
  sub rsp, 0x20                              ; linked-va=0x7ff603a011ac linked-bytes=48 83 ec 20
  call CloseHandle                           ; linked-va=0x7ff603a011b0 linked-bytes=ff 15 82 0e 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603a011b6 linked-bytes=48 83 c4 20
  mov eax, 0x1                               ; linked-va=0x7ff603a011ba linked-bytes=b8 01 00 00 00
  ret                                        ; linked-va=0x7ff603a011bf linked-bytes=c3
.loc_01c0:
  xor eax, eax                               ; linked-va=0x7ff603a011c0 linked-bytes=31 c0
  ret                                        ; linked-va=0x7ff603a011c2 linked-bytes=c3
.loc_01c3:
  mov rdx, errorPrefix                       ; linked-va=0x7ff603a011c3 linked-bytes=48 ba 63 30 a0 03 f6 7f 00 00
  mov r8, 0x1                                ; linked-va=0x7ff603a011cd linked-bytes=49 b8 01 00 00 00 00 00 00 00
  call .loc_0067                             ; linked-va=0x7ff603a011d7 linked-bytes=e8 8b fe ff ff
  mov rax, readCount                         ; linked-va=0x7ff603a011dc linked-bytes=48 b8 c0 40 a0 03 f6 7f 00 00
  mov r8, [rax]                              ; linked-va=0x7ff603a011e6 linked-bytes=4c 8b 00
  sub r8, 0x2                                ; linked-va=0x7ff603a011e9 linked-bytes=49 83 e8 02
  mov rdx, input                             ; linked-va=0x7ff603a011ed linked-bytes=48 ba c0 30 a0 03 f6 7f 00 00
  call .loc_0067                             ; linked-va=0x7ff603a011f7 linked-bytes=e8 6b fe ff ff
  mov rdx, errorSuffix                       ; linked-va=0x7ff603a011fc linked-bytes=48 ba 65 30 a0 03 f6 7f 00 00
  mov r8, 0x5a                               ; linked-va=0x7ff603a01206 linked-bytes=49 b8 5a 00 00 00 00 00 00 00
  call .loc_0067                             ; linked-va=0x7ff603a01210 linked-bytes=e8 52 fe ff ff
  ret                                        ; linked-va=0x7ff603a01215 linked-bytes=c3

section .rdata
; bytes=192; linker chooses the section RVA

banner:
  ; utf8="Microsoft Windows [Version 10.0.19045.4046]\r\n(c) Microsoft Corporation. All rights reserved.\r\n\r\n\u0000"
  db 0x4d, 0x69, 0x63, 0x72, 0x6f, 0x73, 0x6f, 0x66, 0x74, 0x20, 0x57, 0x69, 0x6e, 0x64, 0x6f, 0x77
  db 0x73, 0x20, 0x5b, 0x56, 0x65, 0x72, 0x73, 0x69, 0x6f, 0x6e, 0x20, 0x31, 0x30, 0x2e, 0x30, 0x2e
  db 0x31, 0x39, 0x30, 0x34, 0x35, 0x2e, 0x34, 0x30, 0x34, 0x36, 0x5d, 0x0d, 0x0a, 0x28, 0x63, 0x29
  db 0x20, 0x4d, 0x69, 0x63, 0x72, 0x6f, 0x73, 0x6f, 0x66, 0x74, 0x20, 0x43, 0x6f, 0x72, 0x70, 0x6f
  db 0x72, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x2e, 0x20, 0x41, 0x6c, 0x6c, 0x20, 0x72, 0x69, 0x67, 0x68
  db 0x74, 0x73, 0x20, 0x72, 0x65, 0x73, 0x65, 0x72, 0x76, 0x65, 0x64, 0x2e, 0x0d, 0x0a, 0x0d, 0x0a
  db 0x00

prompt:
  ; utf8=">\u0000"
  db 0x3e, 0x00

errorPrefix:
  ; utf8="'\u0000"
  db 0x27, 0x00

errorSuffix:
  ; utf8="' is not recognized as an internal or external command,\r\noperable program or batch file.\r\n\u0000"
  db 0x27, 0x20, 0x69, 0x73, 0x20, 0x6e, 0x6f, 0x74, 0x20, 0x72, 0x65, 0x63, 0x6f, 0x67, 0x6e, 0x69
  db 0x7a, 0x65, 0x64, 0x20, 0x61, 0x73, 0x20, 0x61, 0x6e, 0x20, 0x69, 0x6e, 0x74, 0x65, 0x72, 0x6e
  db 0x61, 0x6c, 0x20, 0x6f, 0x72, 0x20, 0x65, 0x78, 0x74, 0x65, 0x72, 0x6e, 0x61, 0x6c, 0x20, 0x63
  db 0x6f, 0x6d, 0x6d, 0x61, 0x6e, 0x64, 0x2c, 0x0d, 0x0a, 0x6f, 0x70, 0x65, 0x72, 0x61, 0x62, 0x6c
  db 0x65, 0x20, 0x70, 0x72, 0x6f, 0x67, 0x72, 0x61, 0x6d, 0x20, 0x6f, 0x72, 0x20, 0x62, 0x61, 0x74
  db 0x63, 0x68, 0x20, 0x66, 0x69, 0x6c, 0x65, 0x2e, 0x0d, 0x0a, 0x00

section .data
; bytes=0; linker chooses the section RVA
; empty

section .bss
; bytes=4400; linker chooses the section RVA

input:
  resb 4096

readCount:
  resb 8

writtenCount:
  resb 8

currentDirectory:
  resb 260

processInformation:
  resb 24

childExitCode:
  resb 4
