; dir.exe / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export/data relocation targets.
BITS 64
DEFAULT REL

extern GetCurrentDirectoryA
extern printf
extern strlen
extern FindFirstFileA
extern FindNextFileA
extern FindClose

global entry

section .text
; bytes=443; loader chooses the image base and RVA
entry:
  cmp ecx, 0x1                               ; linked-va=0x7ff603c01000 linked-bytes=83 f9 01
  je near .loc_0012                          ; linked-va=0x7ff603c01003 linked-bytes=0f 84 09 00 00 00
  mov r14, [rdx+0x8]                         ; linked-va=0x7ff603c01009 linked-bytes=4c 8b 72 08
  jmp near .loc_0039                         ; linked-va=0x7ff603c0100d linked-bytes=e9 27 00 00 00
.loc_0012:
  mov ecx, 0x104                             ; linked-va=0x7ff603c01012 linked-bytes=b9 04 01 00 00
  mov rdx, currentDirectory                  ; linked-va=0x7ff603c01017 linked-bytes=48 ba 7c 30 c0 03 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff603c01021 linked-bytes=48 83 ec 20
  call GetCurrentDirectoryA                  ; linked-va=0x7ff603c01025 linked-bytes=ff 15 d5 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603c0102b linked-bytes=48 83 c4 20
  mov r14, currentDirectory                  ; linked-va=0x7ff603c0102f linked-bytes=49 be 7c 30 c0 03 f6 7f 00 00
.loc_0039:
  mov rdx, header                            ; linked-va=0x7ff603c01039 linked-bytes=48 ba 00 30 c0 03 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff603c01043 linked-bytes=48 b9 79 30 c0 03 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff603c0104d linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff603c01051 linked-bytes=ff 15 b1 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603c01057 linked-bytes=48 83 c4 20
  mov rcx, r14                               ; linked-va=0x7ff603c0105b linked-bytes=49 8b ce
  sub rsp, 0x20                              ; linked-va=0x7ff603c0105e linked-bytes=48 83 ec 20
  call strlen                                ; linked-va=0x7ff603c01062 linked-bytes=ff 15 a8 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603c01068 linked-bytes=48 83 c4 20
  mov r8, rax                                ; linked-va=0x7ff603c0106c linked-bytes=4c 8b c0
  mov rdx, r14                               ; linked-va=0x7ff603c0106f linked-bytes=49 8b d6
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff603c01072 linked-bytes=48 b9 79 30 c0 03 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff603c0107c linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff603c01080 linked-bytes=ff 15 82 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603c01086 linked-bytes=48 83 c4 20
  mov rdx, newline                           ; linked-va=0x7ff603c0108a linked-bytes=48 ba 49 30 c0 03 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff603c01094 linked-bytes=48 b9 79 30 c0 03 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff603c0109e linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff603c010a2 linked-bytes=ff 15 60 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603c010a8 linked-bytes=48 83 c4 20
  mov rcx, r14                               ; linked-va=0x7ff603c010ac linked-bytes=49 8b ce
  mov rdx, findData                          ; linked-va=0x7ff603c010af linked-bytes=48 ba 80 31 c0 03 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff603c010b9 linked-bytes=48 83 ec 20
  call FindFirstFileA                        ; linked-va=0x7ff603c010bd linked-bytes=ff 15 55 0f 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603c010c3 linked-bytes=48 83 c4 20
  mov r13, rax                               ; linked-va=0x7ff603c010c7 linked-bytes=4c 8b e8
  cmp rax, -0x1                              ; linked-va=0x7ff603c010ca linked-bytes=48 83 f8 ff
  je near .loc_0193                          ; linked-va=0x7ff603c010ce linked-bytes=0f 84 bf 00 00 00
.loc_00d4:
  mov rax, findData                          ; linked-va=0x7ff603c010d4 linked-bytes=48 b8 80 31 c0 03 f6 7f 00 00
  mov eax, [rax]                             ; linked-va=0x7ff603c010de linked-bytes=8b 00
  mov ecx, 0x10                              ; linked-va=0x7ff603c010e0 linked-bytes=b9 10 00 00 00
  test eax, ecx                              ; linked-va=0x7ff603c010e5 linked-bytes=85 c8
  je near .loc_0114                          ; linked-va=0x7ff603c010e7 linked-bytes=0f 84 27 00 00 00
  mov rcx, directoryFormat                   ; linked-va=0x7ff603c010ed linked-bytes=48 b9 0f 30 c0 03 f6 7f 00 00
  mov rdx, findName                          ; linked-va=0x7ff603c010f7 linked-bytes=48 ba ac 31 c0 03 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff603c01101 linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff603c01105 linked-bytes=ff 15 fd 0e 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603c0110b linked-bytes=48 83 c4 20
  jmp near .loc_015c                         ; linked-va=0x7ff603c0110f linked-bytes=e9 48 00 00 00
.loc_0114:
  mov rax, findData                          ; linked-va=0x7ff603c01114 linked-bytes=48 b8 80 31 c0 03 f6 7f 00 00
  mov r10d, [rax+0x20]                       ; linked-va=0x7ff603c0111e linked-bytes=44 8b 50 20
  mov eax, r10d                              ; linked-va=0x7ff603c01122 linked-bytes=41 8b c2
  add eax, 0x3ff                             ; linked-va=0x7ff603c01125 linked-bytes=81 c0 ff 03 00 00
  xor edx, edx                               ; linked-va=0x7ff603c0112b linked-bytes=31 d2
  mov ecx, 0x400                             ; linked-va=0x7ff603c0112d linked-bytes=b9 00 04 00 00
  div ecx                                    ; linked-va=0x7ff603c01132 linked-bytes=f7 f1
  mov r8d, eax                               ; linked-va=0x7ff603c01134 linked-bytes=44 8b c0
  mov edx, r10d                              ; linked-va=0x7ff603c01137 linked-bytes=41 8b d2
  mov r9, findName                           ; linked-va=0x7ff603c0113a linked-bytes=49 b9 ac 31 c0 03 f6 7f 00 00
  mov rcx, fileFormat                        ; linked-va=0x7ff603c01144 linked-bytes=48 b9 23 30 c0 03 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff603c0114e linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff603c01152 linked-bytes=ff 15 b0 0e 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603c01158 linked-bytes=48 83 c4 20
.loc_015c:
  mov rcx, r13                               ; linked-va=0x7ff603c0115c linked-bytes=49 8b cd
  mov rdx, findData                          ; linked-va=0x7ff603c0115f linked-bytes=48 ba 80 31 c0 03 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff603c01169 linked-bytes=48 83 ec 20
  call FindNextFileA                         ; linked-va=0x7ff603c0116d linked-bytes=ff 15 ad 0e 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603c01173 linked-bytes=48 83 c4 20
  test eax, eax                              ; linked-va=0x7ff603c01177 linked-bytes=85 c0
  jne near .loc_00d4                         ; linked-va=0x7ff603c01179 linked-bytes=0f 85 55 ff ff ff
  mov rcx, r13                               ; linked-va=0x7ff603c0117f linked-bytes=49 8b cd
  sub rsp, 0x20                              ; linked-va=0x7ff603c01182 linked-bytes=48 83 ec 20
  call FindClose                             ; linked-va=0x7ff603c01186 linked-bytes=ff 15 9c 0e 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603c0118c linked-bytes=48 83 c4 20
  xor eax, eax                               ; linked-va=0x7ff603c01190 linked-bytes=31 c0
  ret                                        ; linked-va=0x7ff603c01192 linked-bytes=c3
.loc_0193:
  mov rdx, notFound                          ; linked-va=0x7ff603c01193 linked-bytes=48 ba 4c 30 c0 03 f6 7f 00 00
  mov rcx, __exoproc_printf_string_format    ; linked-va=0x7ff603c0119d linked-bytes=48 b9 79 30 c0 03 f6 7f 00 00
  sub rsp, 0x20                              ; linked-va=0x7ff603c011a7 linked-bytes=48 83 ec 20
  call printf                                ; linked-va=0x7ff603c011ab linked-bytes=ff 15 57 0e 00 00
  add rsp, 0x20                              ; linked-va=0x7ff603c011b1 linked-bytes=48 83 c4 20
  mov eax, 0x1                               ; linked-va=0x7ff603c011b5 linked-bytes=b8 01 00 00 00
  ret                                        ; linked-va=0x7ff603c011ba linked-bytes=c3

section .rdata
; bytes=124; linker chooses the section RVA

header:
  ; utf8=" Directory of \u0000"
  db 0x20, 0x44, 0x69, 0x72, 0x65, 0x63, 0x74, 0x6f, 0x72, 0x79, 0x20, 0x6f, 0x66, 0x20, 0x00

directoryFormat:
  ; utf8="<DIR>          %s\r\n\u0000"
  db 0x3c, 0x44, 0x49, 0x52, 0x3e, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x25
  db 0x73, 0x0d, 0x0a, 0x00

fileFormat:
  ; utf8="               %d bytes (%d KB)  %s\r\n\u0000"
  db 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x25
  db 0x64, 0x20, 0x62, 0x79, 0x74, 0x65, 0x73, 0x20, 0x28, 0x25, 0x64, 0x20, 0x4b, 0x42, 0x29, 0x20
  db 0x20, 0x25, 0x73, 0x0d, 0x0a, 0x00

newline:
  ; utf8="\r\n\u0000"
  db 0x0d, 0x0a, 0x00

notFound:
  ; utf8="The system cannot find the path specified.\r\n\u0000"
  db 0x54, 0x68, 0x65, 0x20, 0x73, 0x79, 0x73, 0x74, 0x65, 0x6d, 0x20, 0x63, 0x61, 0x6e, 0x6e, 0x6f
  db 0x74, 0x20, 0x66, 0x69, 0x6e, 0x64, 0x20, 0x74, 0x68, 0x65, 0x20, 0x70, 0x61, 0x74, 0x68, 0x20
  db 0x73, 0x70, 0x65, 0x63, 0x69, 0x66, 0x69, 0x65, 0x64, 0x2e, 0x0d, 0x0a, 0x00

__exoproc_printf_string_format:
  ; utf8="%s\u0000"
  db 0x25, 0x73, 0x00

section .data
; bytes=0; linker chooses the section RVA
; empty

section .bss
; bytes=580; linker chooses the section RVA

currentDirectory:
  resb 260

findData:
  resb 44

findName:
  resb 260

findTail:
  resb 16
