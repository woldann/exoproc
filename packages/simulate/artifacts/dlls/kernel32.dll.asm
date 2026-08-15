; kernel32.dll / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export relocation targets.
BITS 64
DEFAULT REL

global GetLastError
global CreateFileA
global WriteFile
global ReadFile
global ReadProcessMemory
global WriteProcessMemory
global VirtualAlloc
global VirtualAllocEx
global VirtualFree
global VirtualFreeEx
global VirtualProtect
global VirtualProtectEx
global VirtualQuery
global VirtualQueryEx
global GetCurrentThread
global GetCurrentThreadId
global GetThreadId
global OpenThread
global SuspendThread
global ResumeThread
global GetExitCodeThread
global GetThreadContext
global SetThreadContext
global GetCurrentProcess
global GetCurrentProcessId
global GetProcessId
global OpenProcess
global TerminateProcess
global CreateProcessA
global CreateProcessW
global DuplicateHandle
global CreateFileMappingA
global CreateFileMappingW
global OpenFileMappingA
global MapViewOfFile
global UnmapViewOfFile
global CloseHandle
global Sleep
global WaitForSingleObject
global GetExitCodeProcess
global GetModuleHandleW
global GetModuleHandleA
global GetModuleHandleExW
global GetModuleHandleExA
global GetProcAddress
global CreateThread
global CreateRemoteThread
global TerminateThread
global ExitThread
global LoadLibraryA
global LoadLibraryW
global FreeLibrary
global CreateToolhelp32Snapshot
global Process32FirstW
global Process32First
global Process32NextW
global Process32Next
global Module32FirstW
global Module32First
global Module32NextW
global Module32Next
global Thread32First
global Thread32Next
global Heap32ListFirst
global Heap32ListNext
global Heap32First
global Heap32Next
global IsWow64Process
global GetProcessHeap
global HeapCreate
global HeapDestroy
global HeapAlloc
global HeapFree
global HeapReAlloc
global HeapSize
global GetCurrentDirectoryW
global GetCurrentDirectoryA
global SetCurrentDirectoryA
global SetCurrentDirectoryW
global GetEnvironmentVariableA
global GetEnvironmentVariableW
global SetEnvironmentVariableA
global SetEnvironmentVariableW
global FindFirstFileA
global FindNextFileA
global FindClose
global SearchPathA
global ExitProcess
global GetStdHandle
global SetStdHandle
global GetConsoleMode
global SetConsoleMode
global FillConsoleOutputCharacterA
global FillConsoleOutputAttribute
global SetConsoleTextAttribute
global SetConsoleCursorPosition
global CreatePipe
global SetHandleInformation
global CreateFileW

section .text
; bytes=102400; loader chooses the image base and RVA

; export=GetLastError ordinal=0 binding=syscall
GetLastError:
  mov eax, 0x1000                            ; linked-va=0x7fe000000000 linked-bytes=b8 00 10 00 00
  syscall                                    ; linked-va=0x7fe000000005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000000007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000000008 linked-bytes=90
  nop                                        ; linked-va=0x7fe000000009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000000a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000000b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000000c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000000d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000000e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000000f linked-bytes=90
  times 1024 - ($ - GetLastError) db 0xcc

; export=CreateFileA ordinal=1 binding=syscall
CreateFileA:
  mov eax, 0x1001                            ; linked-va=0x7fe000000400 linked-bytes=b8 01 10 00 00
  syscall                                    ; linked-va=0x7fe000000405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000000407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000000408 linked-bytes=90
  nop                                        ; linked-va=0x7fe000000409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000040a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000040b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000040c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000040d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000040e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000040f linked-bytes=90
  times 1024 - ($ - CreateFileA) db 0xcc

; export=WriteFile ordinal=2 binding=syscall
WriteFile:
  mov eax, 0x1002                            ; linked-va=0x7fe000000800 linked-bytes=b8 02 10 00 00
  syscall                                    ; linked-va=0x7fe000000805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000000807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000000808 linked-bytes=90
  nop                                        ; linked-va=0x7fe000000809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000080a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000080b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000080c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000080d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000080e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000080f linked-bytes=90
  times 1024 - ($ - WriteFile) db 0xcc

; export=ReadFile ordinal=3 binding=syscall
ReadFile:
  mov eax, 0x1003                            ; linked-va=0x7fe000000c00 linked-bytes=b8 03 10 00 00
  syscall                                    ; linked-va=0x7fe000000c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000000c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000000c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe000000c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe000000c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe000000c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe000000c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe000000c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe000000c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe000000c0f linked-bytes=90
  times 1024 - ($ - ReadFile) db 0xcc

; export=ReadProcessMemory ordinal=4 binding=syscall
ReadProcessMemory:
  mov eax, 0x1004                            ; linked-va=0x7fe000001000 linked-bytes=b8 04 10 00 00
  syscall                                    ; linked-va=0x7fe000001005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000001007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000001008 linked-bytes=90
  nop                                        ; linked-va=0x7fe000001009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000100a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000100b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000100c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000100d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000100e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000100f linked-bytes=90
  times 1024 - ($ - ReadProcessMemory) db 0xcc

; export=WriteProcessMemory ordinal=5 binding=syscall
WriteProcessMemory:
  mov eax, 0x1005                            ; linked-va=0x7fe000001400 linked-bytes=b8 05 10 00 00
  syscall                                    ; linked-va=0x7fe000001405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000001407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000001408 linked-bytes=90
  nop                                        ; linked-va=0x7fe000001409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000140a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000140b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000140c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000140d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000140e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000140f linked-bytes=90
  times 1024 - ($ - WriteProcessMemory) db 0xcc

; export=VirtualAlloc ordinal=6 binding=syscall
VirtualAlloc:
  mov eax, 0x1006                            ; linked-va=0x7fe000001800 linked-bytes=b8 06 10 00 00
  syscall                                    ; linked-va=0x7fe000001805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000001807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000001808 linked-bytes=90
  nop                                        ; linked-va=0x7fe000001809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000180a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000180b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000180c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000180d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000180e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000180f linked-bytes=90
  times 1024 - ($ - VirtualAlloc) db 0xcc

; export=VirtualAllocEx ordinal=7 binding=syscall
VirtualAllocEx:
  mov eax, 0x1007                            ; linked-va=0x7fe000001c00 linked-bytes=b8 07 10 00 00
  syscall                                    ; linked-va=0x7fe000001c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000001c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000001c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe000001c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe000001c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe000001c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe000001c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe000001c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe000001c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe000001c0f linked-bytes=90
  times 1024 - ($ - VirtualAllocEx) db 0xcc

; export=VirtualFree ordinal=8 binding=syscall
VirtualFree:
  mov eax, 0x1008                            ; linked-va=0x7fe000002000 linked-bytes=b8 08 10 00 00
  syscall                                    ; linked-va=0x7fe000002005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000002007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000002008 linked-bytes=90
  nop                                        ; linked-va=0x7fe000002009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000200a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000200b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000200c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000200d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000200e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000200f linked-bytes=90
  times 1024 - ($ - VirtualFree) db 0xcc

; export=VirtualFreeEx ordinal=9 binding=syscall
VirtualFreeEx:
  mov eax, 0x1009                            ; linked-va=0x7fe000002400 linked-bytes=b8 09 10 00 00
  syscall                                    ; linked-va=0x7fe000002405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000002407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000002408 linked-bytes=90
  nop                                        ; linked-va=0x7fe000002409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000240a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000240b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000240c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000240d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000240e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000240f linked-bytes=90
  times 1024 - ($ - VirtualFreeEx) db 0xcc

; export=VirtualProtect ordinal=10 binding=syscall
VirtualProtect:
  mov eax, 0x100a                            ; linked-va=0x7fe000002800 linked-bytes=b8 0a 10 00 00
  syscall                                    ; linked-va=0x7fe000002805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000002807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000002808 linked-bytes=90
  nop                                        ; linked-va=0x7fe000002809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000280a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000280b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000280c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000280d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000280e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000280f linked-bytes=90
  times 1024 - ($ - VirtualProtect) db 0xcc

; export=VirtualProtectEx ordinal=11 binding=syscall
VirtualProtectEx:
  mov eax, 0x100b                            ; linked-va=0x7fe000002c00 linked-bytes=b8 0b 10 00 00
  syscall                                    ; linked-va=0x7fe000002c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000002c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000002c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe000002c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe000002c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe000002c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe000002c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe000002c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe000002c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe000002c0f linked-bytes=90
  times 1024 - ($ - VirtualProtectEx) db 0xcc

; export=VirtualQuery ordinal=12 binding=syscall
VirtualQuery:
  mov eax, 0x100c                            ; linked-va=0x7fe000003000 linked-bytes=b8 0c 10 00 00
  syscall                                    ; linked-va=0x7fe000003005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000003007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000003008 linked-bytes=90
  nop                                        ; linked-va=0x7fe000003009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000300a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000300b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000300c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000300d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000300e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000300f linked-bytes=90
  times 1024 - ($ - VirtualQuery) db 0xcc

; export=VirtualQueryEx ordinal=13 binding=syscall
VirtualQueryEx:
  mov eax, 0x100d                            ; linked-va=0x7fe000003400 linked-bytes=b8 0d 10 00 00
  syscall                                    ; linked-va=0x7fe000003405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000003407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000003408 linked-bytes=90
  nop                                        ; linked-va=0x7fe000003409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000340a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000340b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000340c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000340d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000340e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000340f linked-bytes=90
  times 1024 - ($ - VirtualQueryEx) db 0xcc

; export=GetCurrentThread ordinal=14 binding=syscall
GetCurrentThread:
  mov eax, 0x100e                            ; linked-va=0x7fe000003800 linked-bytes=b8 0e 10 00 00
  syscall                                    ; linked-va=0x7fe000003805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000003807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000003808 linked-bytes=90
  nop                                        ; linked-va=0x7fe000003809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000380a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000380b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000380c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000380d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000380e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000380f linked-bytes=90
  times 1024 - ($ - GetCurrentThread) db 0xcc

; export=GetCurrentThreadId ordinal=15 binding=syscall
GetCurrentThreadId:
  mov eax, 0x100f                            ; linked-va=0x7fe000003c00 linked-bytes=b8 0f 10 00 00
  syscall                                    ; linked-va=0x7fe000003c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000003c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000003c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe000003c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe000003c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe000003c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe000003c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe000003c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe000003c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe000003c0f linked-bytes=90
  times 1024 - ($ - GetCurrentThreadId) db 0xcc

; export=GetThreadId ordinal=16 binding=syscall
GetThreadId:
  mov eax, 0x1010                            ; linked-va=0x7fe000004000 linked-bytes=b8 10 10 00 00
  syscall                                    ; linked-va=0x7fe000004005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000004007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000004008 linked-bytes=90
  nop                                        ; linked-va=0x7fe000004009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000400a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000400b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000400c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000400d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000400e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000400f linked-bytes=90
  times 1024 - ($ - GetThreadId) db 0xcc

; export=OpenThread ordinal=17 binding=syscall
OpenThread:
  mov eax, 0x1011                            ; linked-va=0x7fe000004400 linked-bytes=b8 11 10 00 00
  syscall                                    ; linked-va=0x7fe000004405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000004407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000004408 linked-bytes=90
  nop                                        ; linked-va=0x7fe000004409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000440a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000440b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000440c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000440d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000440e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000440f linked-bytes=90
  times 1024 - ($ - OpenThread) db 0xcc

; export=SuspendThread ordinal=18 binding=syscall
SuspendThread:
  mov eax, 0x1012                            ; linked-va=0x7fe000004800 linked-bytes=b8 12 10 00 00
  syscall                                    ; linked-va=0x7fe000004805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000004807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000004808 linked-bytes=90
  nop                                        ; linked-va=0x7fe000004809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000480a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000480b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000480c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000480d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000480e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000480f linked-bytes=90
  times 1024 - ($ - SuspendThread) db 0xcc

; export=ResumeThread ordinal=19 binding=syscall
ResumeThread:
  mov eax, 0x1013                            ; linked-va=0x7fe000004c00 linked-bytes=b8 13 10 00 00
  syscall                                    ; linked-va=0x7fe000004c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000004c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000004c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe000004c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe000004c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe000004c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe000004c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe000004c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe000004c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe000004c0f linked-bytes=90
  times 1024 - ($ - ResumeThread) db 0xcc

; export=GetExitCodeThread ordinal=20 binding=syscall
GetExitCodeThread:
  mov eax, 0x1014                            ; linked-va=0x7fe000005000 linked-bytes=b8 14 10 00 00
  syscall                                    ; linked-va=0x7fe000005005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000005007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000005008 linked-bytes=90
  nop                                        ; linked-va=0x7fe000005009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000500a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000500b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000500c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000500d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000500e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000500f linked-bytes=90
  times 1024 - ($ - GetExitCodeThread) db 0xcc

; export=GetThreadContext ordinal=21 binding=syscall
GetThreadContext:
  mov eax, 0x1015                            ; linked-va=0x7fe000005400 linked-bytes=b8 15 10 00 00
  syscall                                    ; linked-va=0x7fe000005405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000005407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000005408 linked-bytes=90
  nop                                        ; linked-va=0x7fe000005409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000540a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000540b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000540c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000540d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000540e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000540f linked-bytes=90
  times 1024 - ($ - GetThreadContext) db 0xcc

; export=SetThreadContext ordinal=22 binding=syscall
SetThreadContext:
  mov eax, 0x1016                            ; linked-va=0x7fe000005800 linked-bytes=b8 16 10 00 00
  syscall                                    ; linked-va=0x7fe000005805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000005807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000005808 linked-bytes=90
  nop                                        ; linked-va=0x7fe000005809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000580a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000580b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000580c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000580d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000580e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000580f linked-bytes=90
  times 1024 - ($ - SetThreadContext) db 0xcc

; export=GetCurrentProcess ordinal=23 binding=syscall
GetCurrentProcess:
  mov eax, 0x1017                            ; linked-va=0x7fe000005c00 linked-bytes=b8 17 10 00 00
  syscall                                    ; linked-va=0x7fe000005c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000005c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000005c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe000005c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe000005c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe000005c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe000005c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe000005c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe000005c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe000005c0f linked-bytes=90
  times 1024 - ($ - GetCurrentProcess) db 0xcc

; export=GetCurrentProcessId ordinal=24 binding=syscall
GetCurrentProcessId:
  mov eax, 0x1018                            ; linked-va=0x7fe000006000 linked-bytes=b8 18 10 00 00
  syscall                                    ; linked-va=0x7fe000006005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000006007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000006008 linked-bytes=90
  nop                                        ; linked-va=0x7fe000006009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000600a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000600b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000600c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000600d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000600e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000600f linked-bytes=90
  times 1024 - ($ - GetCurrentProcessId) db 0xcc

; export=GetProcessId ordinal=25 binding=syscall
GetProcessId:
  mov eax, 0x1019                            ; linked-va=0x7fe000006400 linked-bytes=b8 19 10 00 00
  syscall                                    ; linked-va=0x7fe000006405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000006407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000006408 linked-bytes=90
  nop                                        ; linked-va=0x7fe000006409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000640a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000640b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000640c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000640d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000640e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000640f linked-bytes=90
  times 1024 - ($ - GetProcessId) db 0xcc

; export=OpenProcess ordinal=26 binding=syscall
OpenProcess:
  mov eax, 0x101a                            ; linked-va=0x7fe000006800 linked-bytes=b8 1a 10 00 00
  syscall                                    ; linked-va=0x7fe000006805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000006807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000006808 linked-bytes=90
  nop                                        ; linked-va=0x7fe000006809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000680a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000680b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000680c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000680d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000680e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000680f linked-bytes=90
  times 1024 - ($ - OpenProcess) db 0xcc

; export=TerminateProcess ordinal=27 binding=syscall
TerminateProcess:
  mov eax, 0x101b                            ; linked-va=0x7fe000006c00 linked-bytes=b8 1b 10 00 00
  syscall                                    ; linked-va=0x7fe000006c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000006c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000006c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe000006c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe000006c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe000006c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe000006c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe000006c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe000006c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe000006c0f linked-bytes=90
  times 1024 - ($ - TerminateProcess) db 0xcc

; export=CreateProcessA ordinal=28 binding=syscall
CreateProcessA:
  mov eax, 0x101c                            ; linked-va=0x7fe000007000 linked-bytes=b8 1c 10 00 00
  syscall                                    ; linked-va=0x7fe000007005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000007007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000007008 linked-bytes=90
  nop                                        ; linked-va=0x7fe000007009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000700a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000700b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000700c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000700d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000700e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000700f linked-bytes=90
  times 1024 - ($ - CreateProcessA) db 0xcc

; export=CreateProcessW ordinal=29 binding=syscall
CreateProcessW:
  mov eax, 0x101d                            ; linked-va=0x7fe000007400 linked-bytes=b8 1d 10 00 00
  syscall                                    ; linked-va=0x7fe000007405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000007407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000007408 linked-bytes=90
  nop                                        ; linked-va=0x7fe000007409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000740a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000740b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000740c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000740d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000740e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000740f linked-bytes=90
  times 1024 - ($ - CreateProcessW) db 0xcc

; export=DuplicateHandle ordinal=30 binding=syscall
DuplicateHandle:
  mov eax, 0x101e                            ; linked-va=0x7fe000007800 linked-bytes=b8 1e 10 00 00
  syscall                                    ; linked-va=0x7fe000007805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000007807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000007808 linked-bytes=90
  nop                                        ; linked-va=0x7fe000007809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000780a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000780b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000780c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000780d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000780e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000780f linked-bytes=90
  times 1024 - ($ - DuplicateHandle) db 0xcc

; export=CreateFileMappingA ordinal=31 binding=syscall
CreateFileMappingA:
  mov eax, 0x101f                            ; linked-va=0x7fe000007c00 linked-bytes=b8 1f 10 00 00
  syscall                                    ; linked-va=0x7fe000007c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000007c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000007c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe000007c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe000007c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe000007c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe000007c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe000007c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe000007c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe000007c0f linked-bytes=90
  times 1024 - ($ - CreateFileMappingA) db 0xcc

; export=CreateFileMappingW ordinal=32 binding=syscall
CreateFileMappingW:
  mov eax, 0x1020                            ; linked-va=0x7fe000008000 linked-bytes=b8 20 10 00 00
  syscall                                    ; linked-va=0x7fe000008005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000008007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000008008 linked-bytes=90
  nop                                        ; linked-va=0x7fe000008009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000800a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000800b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000800c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000800d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000800e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000800f linked-bytes=90
  times 1024 - ($ - CreateFileMappingW) db 0xcc

; export=OpenFileMappingA ordinal=33 binding=syscall
OpenFileMappingA:
  mov eax, 0x1021                            ; linked-va=0x7fe000008400 linked-bytes=b8 21 10 00 00
  syscall                                    ; linked-va=0x7fe000008405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000008407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000008408 linked-bytes=90
  nop                                        ; linked-va=0x7fe000008409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000840a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000840b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000840c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000840d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000840e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000840f linked-bytes=90
  times 1024 - ($ - OpenFileMappingA) db 0xcc

; export=MapViewOfFile ordinal=34 binding=syscall
MapViewOfFile:
  mov eax, 0x1022                            ; linked-va=0x7fe000008800 linked-bytes=b8 22 10 00 00
  syscall                                    ; linked-va=0x7fe000008805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000008807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000008808 linked-bytes=90
  nop                                        ; linked-va=0x7fe000008809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000880a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000880b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000880c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000880d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000880e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000880f linked-bytes=90
  times 1024 - ($ - MapViewOfFile) db 0xcc

; export=UnmapViewOfFile ordinal=35 binding=syscall
UnmapViewOfFile:
  mov eax, 0x1023                            ; linked-va=0x7fe000008c00 linked-bytes=b8 23 10 00 00
  syscall                                    ; linked-va=0x7fe000008c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000008c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000008c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe000008c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe000008c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe000008c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe000008c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe000008c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe000008c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe000008c0f linked-bytes=90
  times 1024 - ($ - UnmapViewOfFile) db 0xcc

; export=CloseHandle ordinal=36 binding=syscall
CloseHandle:
  mov eax, 0x1024                            ; linked-va=0x7fe000009000 linked-bytes=b8 24 10 00 00
  syscall                                    ; linked-va=0x7fe000009005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000009007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000009008 linked-bytes=90
  nop                                        ; linked-va=0x7fe000009009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000900a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000900b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000900c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000900d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000900e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000900f linked-bytes=90
  times 1024 - ($ - CloseHandle) db 0xcc

; export=Sleep ordinal=37 binding=syscall
Sleep:
  mov eax, 0x1025                            ; linked-va=0x7fe000009400 linked-bytes=b8 25 10 00 00
  syscall                                    ; linked-va=0x7fe000009405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000009407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000009408 linked-bytes=90
  nop                                        ; linked-va=0x7fe000009409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000940a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000940b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000940c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000940d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000940e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000940f linked-bytes=90
  times 1024 - ($ - Sleep) db 0xcc

; export=WaitForSingleObject ordinal=38 binding=syscall
WaitForSingleObject:
  mov eax, 0x1026                            ; linked-va=0x7fe000009800 linked-bytes=b8 26 10 00 00
  syscall                                    ; linked-va=0x7fe000009805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000009807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000009808 linked-bytes=90
  nop                                        ; linked-va=0x7fe000009809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000980a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000980b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000980c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000980d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000980e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000980f linked-bytes=90
  times 1024 - ($ - WaitForSingleObject) db 0xcc

; export=GetExitCodeProcess ordinal=39 binding=syscall
GetExitCodeProcess:
  mov eax, 0x1027                            ; linked-va=0x7fe000009c00 linked-bytes=b8 27 10 00 00
  syscall                                    ; linked-va=0x7fe000009c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000009c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000009c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe000009c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe000009c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe000009c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe000009c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe000009c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe000009c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe000009c0f linked-bytes=90
  times 1024 - ($ - GetExitCodeProcess) db 0xcc

; export=GetModuleHandleW ordinal=40 binding=syscall
GetModuleHandleW:
  mov eax, 0x1028                            ; linked-va=0x7fe00000a000 linked-bytes=b8 28 10 00 00
  syscall                                    ; linked-va=0x7fe00000a005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000a007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000a008 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000a009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000a00a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000a00b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000a00c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000a00d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000a00e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000a00f linked-bytes=90
  times 1024 - ($ - GetModuleHandleW) db 0xcc

; export=GetModuleHandleA ordinal=41 binding=syscall
GetModuleHandleA:
  mov eax, 0x1029                            ; linked-va=0x7fe00000a400 linked-bytes=b8 29 10 00 00
  syscall                                    ; linked-va=0x7fe00000a405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000a407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000a408 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000a409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000a40a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000a40b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000a40c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000a40d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000a40e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000a40f linked-bytes=90
  times 1024 - ($ - GetModuleHandleA) db 0xcc

; export=GetModuleHandleExW ordinal=42 binding=syscall
GetModuleHandleExW:
  mov eax, 0x102a                            ; linked-va=0x7fe00000a800 linked-bytes=b8 2a 10 00 00
  syscall                                    ; linked-va=0x7fe00000a805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000a807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000a808 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000a809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000a80a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000a80b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000a80c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000a80d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000a80e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000a80f linked-bytes=90
  times 1024 - ($ - GetModuleHandleExW) db 0xcc

; export=GetModuleHandleExA ordinal=43 binding=syscall
GetModuleHandleExA:
  mov eax, 0x102b                            ; linked-va=0x7fe00000ac00 linked-bytes=b8 2b 10 00 00
  syscall                                    ; linked-va=0x7fe00000ac05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000ac07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000ac08 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000ac09 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000ac0a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000ac0b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000ac0c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000ac0d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000ac0e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000ac0f linked-bytes=90
  times 1024 - ($ - GetModuleHandleExA) db 0xcc

; export=GetProcAddress ordinal=44 binding=syscall
GetProcAddress:
  mov eax, 0x102c                            ; linked-va=0x7fe00000b000 linked-bytes=b8 2c 10 00 00
  syscall                                    ; linked-va=0x7fe00000b005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000b007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000b008 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000b009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000b00a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000b00b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000b00c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000b00d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000b00e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000b00f linked-bytes=90
  times 1024 - ($ - GetProcAddress) db 0xcc

; export=CreateThread ordinal=45 binding=syscall
CreateThread:
  mov eax, 0x102d                            ; linked-va=0x7fe00000b400 linked-bytes=b8 2d 10 00 00
  syscall                                    ; linked-va=0x7fe00000b405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000b407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000b408 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000b409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000b40a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000b40b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000b40c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000b40d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000b40e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000b40f linked-bytes=90
  times 1024 - ($ - CreateThread) db 0xcc

; export=CreateRemoteThread ordinal=46 binding=syscall
CreateRemoteThread:
  mov eax, 0x102e                            ; linked-va=0x7fe00000b800 linked-bytes=b8 2e 10 00 00
  syscall                                    ; linked-va=0x7fe00000b805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000b807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000b808 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000b809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000b80a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000b80b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000b80c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000b80d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000b80e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000b80f linked-bytes=90
  times 1024 - ($ - CreateRemoteThread) db 0xcc

; export=TerminateThread ordinal=47 binding=syscall
TerminateThread:
  mov eax, 0x102f                            ; linked-va=0x7fe00000bc00 linked-bytes=b8 2f 10 00 00
  syscall                                    ; linked-va=0x7fe00000bc05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000bc07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000bc08 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000bc09 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000bc0a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000bc0b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000bc0c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000bc0d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000bc0e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000bc0f linked-bytes=90
  times 1024 - ($ - TerminateThread) db 0xcc

; export=ExitThread ordinal=48 binding=syscall
ExitThread:
  mov eax, 0x1030                            ; linked-va=0x7fe00000c000 linked-bytes=b8 30 10 00 00
  syscall                                    ; linked-va=0x7fe00000c005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000c007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000c008 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000c009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000c00a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000c00b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000c00c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000c00d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000c00e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000c00f linked-bytes=90
  times 1024 - ($ - ExitThread) db 0xcc

; export=LoadLibraryA ordinal=49 binding=syscall
LoadLibraryA:
  mov eax, 0x1031                            ; linked-va=0x7fe00000c400 linked-bytes=b8 31 10 00 00
  syscall                                    ; linked-va=0x7fe00000c405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000c407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000c408 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000c409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000c40a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000c40b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000c40c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000c40d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000c40e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000c40f linked-bytes=90
  times 1024 - ($ - LoadLibraryA) db 0xcc

; export=LoadLibraryW ordinal=50 binding=syscall
LoadLibraryW:
  mov eax, 0x1032                            ; linked-va=0x7fe00000c800 linked-bytes=b8 32 10 00 00
  syscall                                    ; linked-va=0x7fe00000c805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000c807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000c808 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000c809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000c80a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000c80b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000c80c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000c80d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000c80e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000c80f linked-bytes=90
  times 1024 - ($ - LoadLibraryW) db 0xcc

; export=FreeLibrary ordinal=51 binding=syscall
FreeLibrary:
  mov eax, 0x1033                            ; linked-va=0x7fe00000cc00 linked-bytes=b8 33 10 00 00
  syscall                                    ; linked-va=0x7fe00000cc05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000cc07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000cc08 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000cc09 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000cc0a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000cc0b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000cc0c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000cc0d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000cc0e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000cc0f linked-bytes=90
  times 1024 - ($ - FreeLibrary) db 0xcc

; export=CreateToolhelp32Snapshot ordinal=52 binding=syscall
CreateToolhelp32Snapshot:
  mov eax, 0x1034                            ; linked-va=0x7fe00000d000 linked-bytes=b8 34 10 00 00
  syscall                                    ; linked-va=0x7fe00000d005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000d007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000d008 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000d009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000d00a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000d00b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000d00c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000d00d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000d00e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000d00f linked-bytes=90
  times 1024 - ($ - CreateToolhelp32Snapshot) db 0xcc

; export=Process32FirstW ordinal=53 binding=syscall
Process32FirstW:
  mov eax, 0x1035                            ; linked-va=0x7fe00000d400 linked-bytes=b8 35 10 00 00
  syscall                                    ; linked-va=0x7fe00000d405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000d407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000d408 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000d409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000d40a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000d40b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000d40c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000d40d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000d40e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000d40f linked-bytes=90
  times 1024 - ($ - Process32FirstW) db 0xcc

; export=Process32First ordinal=54 binding=syscall
Process32First:
  mov eax, 0x1036                            ; linked-va=0x7fe00000d800 linked-bytes=b8 36 10 00 00
  syscall                                    ; linked-va=0x7fe00000d805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000d807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000d808 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000d809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000d80a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000d80b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000d80c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000d80d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000d80e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000d80f linked-bytes=90
  times 1024 - ($ - Process32First) db 0xcc

; export=Process32NextW ordinal=55 binding=syscall
Process32NextW:
  mov eax, 0x1037                            ; linked-va=0x7fe00000dc00 linked-bytes=b8 37 10 00 00
  syscall                                    ; linked-va=0x7fe00000dc05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000dc07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000dc08 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000dc09 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000dc0a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000dc0b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000dc0c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000dc0d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000dc0e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000dc0f linked-bytes=90
  times 1024 - ($ - Process32NextW) db 0xcc

; export=Process32Next ordinal=56 binding=syscall
Process32Next:
  mov eax, 0x1038                            ; linked-va=0x7fe00000e000 linked-bytes=b8 38 10 00 00
  syscall                                    ; linked-va=0x7fe00000e005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000e007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000e008 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000e009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000e00a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000e00b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000e00c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000e00d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000e00e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000e00f linked-bytes=90
  times 1024 - ($ - Process32Next) db 0xcc

; export=Module32FirstW ordinal=57 binding=syscall
Module32FirstW:
  mov eax, 0x1039                            ; linked-va=0x7fe00000e400 linked-bytes=b8 39 10 00 00
  syscall                                    ; linked-va=0x7fe00000e405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000e407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000e408 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000e409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000e40a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000e40b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000e40c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000e40d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000e40e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000e40f linked-bytes=90
  times 1024 - ($ - Module32FirstW) db 0xcc

; export=Module32First ordinal=58 binding=syscall
Module32First:
  mov eax, 0x103a                            ; linked-va=0x7fe00000e800 linked-bytes=b8 3a 10 00 00
  syscall                                    ; linked-va=0x7fe00000e805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000e807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000e808 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000e809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000e80a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000e80b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000e80c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000e80d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000e80e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000e80f linked-bytes=90
  times 1024 - ($ - Module32First) db 0xcc

; export=Module32NextW ordinal=59 binding=syscall
Module32NextW:
  mov eax, 0x103b                            ; linked-va=0x7fe00000ec00 linked-bytes=b8 3b 10 00 00
  syscall                                    ; linked-va=0x7fe00000ec05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000ec07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000ec08 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000ec09 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000ec0a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000ec0b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000ec0c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000ec0d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000ec0e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000ec0f linked-bytes=90
  times 1024 - ($ - Module32NextW) db 0xcc

; export=Module32Next ordinal=60 binding=syscall
Module32Next:
  mov eax, 0x103c                            ; linked-va=0x7fe00000f000 linked-bytes=b8 3c 10 00 00
  syscall                                    ; linked-va=0x7fe00000f005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000f007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000f008 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000f009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000f00a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000f00b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000f00c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000f00d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000f00e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000f00f linked-bytes=90
  times 1024 - ($ - Module32Next) db 0xcc

; export=Thread32First ordinal=61 binding=syscall
Thread32First:
  mov eax, 0x103d                            ; linked-va=0x7fe00000f400 linked-bytes=b8 3d 10 00 00
  syscall                                    ; linked-va=0x7fe00000f405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000f407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000f408 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000f409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000f40a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000f40b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000f40c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000f40d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000f40e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000f40f linked-bytes=90
  times 1024 - ($ - Thread32First) db 0xcc

; export=Thread32Next ordinal=62 binding=syscall
Thread32Next:
  mov eax, 0x103e                            ; linked-va=0x7fe00000f800 linked-bytes=b8 3e 10 00 00
  syscall                                    ; linked-va=0x7fe00000f805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000f807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000f808 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000f809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000f80a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000f80b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000f80c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000f80d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000f80e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000f80f linked-bytes=90
  times 1024 - ($ - Thread32Next) db 0xcc

; export=Heap32ListFirst ordinal=63 binding=syscall
Heap32ListFirst:
  mov eax, 0x103f                            ; linked-va=0x7fe00000fc00 linked-bytes=b8 3f 10 00 00
  syscall                                    ; linked-va=0x7fe00000fc05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe00000fc07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe00000fc08 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000fc09 linked-bytes=90
  nop                                        ; linked-va=0x7fe00000fc0a linked-bytes=90
  nop                                        ; linked-va=0x7fe00000fc0b linked-bytes=90
  nop                                        ; linked-va=0x7fe00000fc0c linked-bytes=90
  nop                                        ; linked-va=0x7fe00000fc0d linked-bytes=90
  nop                                        ; linked-va=0x7fe00000fc0e linked-bytes=90
  nop                                        ; linked-va=0x7fe00000fc0f linked-bytes=90
  times 1024 - ($ - Heap32ListFirst) db 0xcc

; export=Heap32ListNext ordinal=64 binding=syscall
Heap32ListNext:
  mov eax, 0x1040                            ; linked-va=0x7fe000010000 linked-bytes=b8 40 10 00 00
  syscall                                    ; linked-va=0x7fe000010005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000010007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000010008 linked-bytes=90
  nop                                        ; linked-va=0x7fe000010009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001000a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001000b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001000c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001000d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001000e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001000f linked-bytes=90
  times 1024 - ($ - Heap32ListNext) db 0xcc

; export=Heap32First ordinal=65 binding=syscall
Heap32First:
  mov eax, 0x1041                            ; linked-va=0x7fe000010400 linked-bytes=b8 41 10 00 00
  syscall                                    ; linked-va=0x7fe000010405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000010407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000010408 linked-bytes=90
  nop                                        ; linked-va=0x7fe000010409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001040a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001040b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001040c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001040d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001040e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001040f linked-bytes=90
  times 1024 - ($ - Heap32First) db 0xcc

; export=Heap32Next ordinal=66 binding=syscall
Heap32Next:
  mov eax, 0x1042                            ; linked-va=0x7fe000010800 linked-bytes=b8 42 10 00 00
  syscall                                    ; linked-va=0x7fe000010805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000010807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000010808 linked-bytes=90
  nop                                        ; linked-va=0x7fe000010809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001080a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001080b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001080c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001080d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001080e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001080f linked-bytes=90
  times 1024 - ($ - Heap32Next) db 0xcc

; export=IsWow64Process ordinal=67 binding=syscall
IsWow64Process:
  mov eax, 0x1043                            ; linked-va=0x7fe000010c00 linked-bytes=b8 43 10 00 00
  syscall                                    ; linked-va=0x7fe000010c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000010c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000010c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe000010c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe000010c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe000010c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe000010c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe000010c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe000010c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe000010c0f linked-bytes=90
  times 1024 - ($ - IsWow64Process) db 0xcc

; export=GetProcessHeap ordinal=68 binding=syscall
GetProcessHeap:
  mov eax, 0x1044                            ; linked-va=0x7fe000011000 linked-bytes=b8 44 10 00 00
  syscall                                    ; linked-va=0x7fe000011005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000011007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000011008 linked-bytes=90
  nop                                        ; linked-va=0x7fe000011009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001100a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001100b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001100c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001100d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001100e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001100f linked-bytes=90
  times 1024 - ($ - GetProcessHeap) db 0xcc

; export=HeapCreate ordinal=69 binding=syscall
HeapCreate:
  mov eax, 0x1045                            ; linked-va=0x7fe000011400 linked-bytes=b8 45 10 00 00
  syscall                                    ; linked-va=0x7fe000011405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000011407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000011408 linked-bytes=90
  nop                                        ; linked-va=0x7fe000011409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001140a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001140b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001140c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001140d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001140e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001140f linked-bytes=90
  times 1024 - ($ - HeapCreate) db 0xcc

; export=HeapDestroy ordinal=70 binding=syscall
HeapDestroy:
  mov eax, 0x1046                            ; linked-va=0x7fe000011800 linked-bytes=b8 46 10 00 00
  syscall                                    ; linked-va=0x7fe000011805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000011807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000011808 linked-bytes=90
  nop                                        ; linked-va=0x7fe000011809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001180a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001180b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001180c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001180d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001180e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001180f linked-bytes=90
  times 1024 - ($ - HeapDestroy) db 0xcc

; export=HeapAlloc ordinal=71 binding=syscall
HeapAlloc:
  mov eax, 0x1047                            ; linked-va=0x7fe000011c00 linked-bytes=b8 47 10 00 00
  syscall                                    ; linked-va=0x7fe000011c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000011c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000011c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe000011c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe000011c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe000011c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe000011c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe000011c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe000011c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe000011c0f linked-bytes=90
  times 1024 - ($ - HeapAlloc) db 0xcc

; export=HeapFree ordinal=72 binding=syscall
HeapFree:
  mov eax, 0x1048                            ; linked-va=0x7fe000012000 linked-bytes=b8 48 10 00 00
  syscall                                    ; linked-va=0x7fe000012005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000012007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000012008 linked-bytes=90
  nop                                        ; linked-va=0x7fe000012009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001200a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001200b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001200c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001200d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001200e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001200f linked-bytes=90
  times 1024 - ($ - HeapFree) db 0xcc

; export=HeapReAlloc ordinal=73 binding=syscall
HeapReAlloc:
  mov eax, 0x1049                            ; linked-va=0x7fe000012400 linked-bytes=b8 49 10 00 00
  syscall                                    ; linked-va=0x7fe000012405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000012407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000012408 linked-bytes=90
  nop                                        ; linked-va=0x7fe000012409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001240a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001240b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001240c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001240d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001240e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001240f linked-bytes=90
  times 1024 - ($ - HeapReAlloc) db 0xcc

; export=HeapSize ordinal=74 binding=syscall
HeapSize:
  mov eax, 0x104a                            ; linked-va=0x7fe000012800 linked-bytes=b8 4a 10 00 00
  syscall                                    ; linked-va=0x7fe000012805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000012807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000012808 linked-bytes=90
  nop                                        ; linked-va=0x7fe000012809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001280a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001280b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001280c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001280d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001280e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001280f linked-bytes=90
  times 1024 - ($ - HeapSize) db 0xcc

; export=GetCurrentDirectoryW ordinal=75 binding=syscall
GetCurrentDirectoryW:
  mov eax, 0x104b                            ; linked-va=0x7fe000012c00 linked-bytes=b8 4b 10 00 00
  syscall                                    ; linked-va=0x7fe000012c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000012c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000012c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe000012c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe000012c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe000012c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe000012c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe000012c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe000012c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe000012c0f linked-bytes=90
  times 1024 - ($ - GetCurrentDirectoryW) db 0xcc

; export=GetCurrentDirectoryA ordinal=76 binding=syscall
GetCurrentDirectoryA:
  mov eax, 0x104c                            ; linked-va=0x7fe000013000 linked-bytes=b8 4c 10 00 00
  syscall                                    ; linked-va=0x7fe000013005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000013007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000013008 linked-bytes=90
  nop                                        ; linked-va=0x7fe000013009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001300a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001300b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001300c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001300d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001300e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001300f linked-bytes=90
  times 1024 - ($ - GetCurrentDirectoryA) db 0xcc

; export=SetCurrentDirectoryA ordinal=77 binding=syscall
SetCurrentDirectoryA:
  mov eax, 0x104d                            ; linked-va=0x7fe000013400 linked-bytes=b8 4d 10 00 00
  syscall                                    ; linked-va=0x7fe000013405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000013407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000013408 linked-bytes=90
  nop                                        ; linked-va=0x7fe000013409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001340a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001340b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001340c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001340d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001340e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001340f linked-bytes=90
  times 1024 - ($ - SetCurrentDirectoryA) db 0xcc

; export=SetCurrentDirectoryW ordinal=78 binding=syscall
SetCurrentDirectoryW:
  mov eax, 0x104e                            ; linked-va=0x7fe000013800 linked-bytes=b8 4e 10 00 00
  syscall                                    ; linked-va=0x7fe000013805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000013807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000013808 linked-bytes=90
  nop                                        ; linked-va=0x7fe000013809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001380a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001380b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001380c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001380d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001380e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001380f linked-bytes=90
  times 1024 - ($ - SetCurrentDirectoryW) db 0xcc

; export=GetEnvironmentVariableA ordinal=79 binding=syscall
GetEnvironmentVariableA:
  mov eax, 0x104f                            ; linked-va=0x7fe000013c00 linked-bytes=b8 4f 10 00 00
  syscall                                    ; linked-va=0x7fe000013c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000013c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000013c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe000013c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe000013c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe000013c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe000013c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe000013c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe000013c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe000013c0f linked-bytes=90
  times 1024 - ($ - GetEnvironmentVariableA) db 0xcc

; export=GetEnvironmentVariableW ordinal=80 binding=syscall
GetEnvironmentVariableW:
  mov eax, 0x1050                            ; linked-va=0x7fe000014000 linked-bytes=b8 50 10 00 00
  syscall                                    ; linked-va=0x7fe000014005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000014007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000014008 linked-bytes=90
  nop                                        ; linked-va=0x7fe000014009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001400a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001400b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001400c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001400d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001400e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001400f linked-bytes=90
  times 1024 - ($ - GetEnvironmentVariableW) db 0xcc

; export=SetEnvironmentVariableA ordinal=81 binding=syscall
SetEnvironmentVariableA:
  mov eax, 0x1051                            ; linked-va=0x7fe000014400 linked-bytes=b8 51 10 00 00
  syscall                                    ; linked-va=0x7fe000014405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000014407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000014408 linked-bytes=90
  nop                                        ; linked-va=0x7fe000014409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001440a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001440b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001440c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001440d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001440e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001440f linked-bytes=90
  times 1024 - ($ - SetEnvironmentVariableA) db 0xcc

; export=SetEnvironmentVariableW ordinal=82 binding=syscall
SetEnvironmentVariableW:
  mov eax, 0x1052                            ; linked-va=0x7fe000014800 linked-bytes=b8 52 10 00 00
  syscall                                    ; linked-va=0x7fe000014805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000014807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000014808 linked-bytes=90
  nop                                        ; linked-va=0x7fe000014809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001480a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001480b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001480c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001480d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001480e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001480f linked-bytes=90
  times 1024 - ($ - SetEnvironmentVariableW) db 0xcc

; export=FindFirstFileA ordinal=83 binding=syscall
FindFirstFileA:
  mov eax, 0x1053                            ; linked-va=0x7fe000014c00 linked-bytes=b8 53 10 00 00
  syscall                                    ; linked-va=0x7fe000014c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000014c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000014c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe000014c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe000014c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe000014c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe000014c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe000014c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe000014c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe000014c0f linked-bytes=90
  times 1024 - ($ - FindFirstFileA) db 0xcc

; export=FindNextFileA ordinal=84 binding=syscall
FindNextFileA:
  mov eax, 0x1054                            ; linked-va=0x7fe000015000 linked-bytes=b8 54 10 00 00
  syscall                                    ; linked-va=0x7fe000015005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000015007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000015008 linked-bytes=90
  nop                                        ; linked-va=0x7fe000015009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001500a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001500b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001500c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001500d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001500e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001500f linked-bytes=90
  times 1024 - ($ - FindNextFileA) db 0xcc

; export=FindClose ordinal=85 binding=syscall
FindClose:
  mov eax, 0x1055                            ; linked-va=0x7fe000015400 linked-bytes=b8 55 10 00 00
  syscall                                    ; linked-va=0x7fe000015405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000015407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000015408 linked-bytes=90
  nop                                        ; linked-va=0x7fe000015409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001540a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001540b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001540c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001540d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001540e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001540f linked-bytes=90
  times 1024 - ($ - FindClose) db 0xcc

; export=SearchPathA ordinal=86 binding=syscall
SearchPathA:
  mov eax, 0x1056                            ; linked-va=0x7fe000015800 linked-bytes=b8 56 10 00 00
  syscall                                    ; linked-va=0x7fe000015805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000015807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000015808 linked-bytes=90
  nop                                        ; linked-va=0x7fe000015809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001580a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001580b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001580c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001580d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001580e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001580f linked-bytes=90
  times 1024 - ($ - SearchPathA) db 0xcc

; export=ExitProcess ordinal=87 binding=syscall
ExitProcess:
  mov eax, 0x1057                            ; linked-va=0x7fe000015c00 linked-bytes=b8 57 10 00 00
  syscall                                    ; linked-va=0x7fe000015c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000015c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000015c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe000015c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe000015c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe000015c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe000015c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe000015c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe000015c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe000015c0f linked-bytes=90
  times 1024 - ($ - ExitProcess) db 0xcc

; export=GetStdHandle ordinal=88 binding=syscall
GetStdHandle:
  mov eax, 0x1058                            ; linked-va=0x7fe000016000 linked-bytes=b8 58 10 00 00
  syscall                                    ; linked-va=0x7fe000016005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000016007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000016008 linked-bytes=90
  nop                                        ; linked-va=0x7fe000016009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001600a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001600b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001600c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001600d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001600e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001600f linked-bytes=90
  times 1024 - ($ - GetStdHandle) db 0xcc

; export=SetStdHandle ordinal=89 binding=syscall
SetStdHandle:
  mov eax, 0x1059                            ; linked-va=0x7fe000016400 linked-bytes=b8 59 10 00 00
  syscall                                    ; linked-va=0x7fe000016405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000016407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000016408 linked-bytes=90
  nop                                        ; linked-va=0x7fe000016409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001640a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001640b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001640c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001640d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001640e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001640f linked-bytes=90
  times 1024 - ($ - SetStdHandle) db 0xcc

; export=GetConsoleMode ordinal=90 binding=syscall
GetConsoleMode:
  mov eax, 0x105a                            ; linked-va=0x7fe000016800 linked-bytes=b8 5a 10 00 00
  syscall                                    ; linked-va=0x7fe000016805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000016807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000016808 linked-bytes=90
  nop                                        ; linked-va=0x7fe000016809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001680a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001680b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001680c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001680d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001680e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001680f linked-bytes=90
  times 1024 - ($ - GetConsoleMode) db 0xcc

; export=SetConsoleMode ordinal=91 binding=syscall
SetConsoleMode:
  mov eax, 0x105b                            ; linked-va=0x7fe000016c00 linked-bytes=b8 5b 10 00 00
  syscall                                    ; linked-va=0x7fe000016c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000016c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000016c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe000016c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe000016c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe000016c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe000016c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe000016c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe000016c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe000016c0f linked-bytes=90
  times 1024 - ($ - SetConsoleMode) db 0xcc

; export=FillConsoleOutputCharacterA ordinal=92 binding=syscall
FillConsoleOutputCharacterA:
  mov eax, 0x105c                            ; linked-va=0x7fe000017000 linked-bytes=b8 5c 10 00 00
  syscall                                    ; linked-va=0x7fe000017005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000017007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000017008 linked-bytes=90
  nop                                        ; linked-va=0x7fe000017009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001700a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001700b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001700c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001700d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001700e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001700f linked-bytes=90
  times 1024 - ($ - FillConsoleOutputCharacterA) db 0xcc

; export=FillConsoleOutputAttribute ordinal=93 binding=syscall
FillConsoleOutputAttribute:
  mov eax, 0x105d                            ; linked-va=0x7fe000017400 linked-bytes=b8 5d 10 00 00
  syscall                                    ; linked-va=0x7fe000017405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000017407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000017408 linked-bytes=90
  nop                                        ; linked-va=0x7fe000017409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001740a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001740b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001740c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001740d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001740e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001740f linked-bytes=90
  times 1024 - ($ - FillConsoleOutputAttribute) db 0xcc

; export=SetConsoleTextAttribute ordinal=94 binding=syscall
SetConsoleTextAttribute:
  mov eax, 0x105e                            ; linked-va=0x7fe000017800 linked-bytes=b8 5e 10 00 00
  syscall                                    ; linked-va=0x7fe000017805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000017807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000017808 linked-bytes=90
  nop                                        ; linked-va=0x7fe000017809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001780a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001780b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001780c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001780d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001780e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001780f linked-bytes=90
  times 1024 - ($ - SetConsoleTextAttribute) db 0xcc

; export=SetConsoleCursorPosition ordinal=95 binding=syscall
SetConsoleCursorPosition:
  mov eax, 0x105f                            ; linked-va=0x7fe000017c00 linked-bytes=b8 5f 10 00 00
  syscall                                    ; linked-va=0x7fe000017c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000017c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000017c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe000017c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe000017c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe000017c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe000017c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe000017c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe000017c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe000017c0f linked-bytes=90
  times 1024 - ($ - SetConsoleCursorPosition) db 0xcc

; export=CreatePipe ordinal=96 binding=syscall
CreatePipe:
  mov eax, 0x1060                            ; linked-va=0x7fe000018000 linked-bytes=b8 60 10 00 00
  syscall                                    ; linked-va=0x7fe000018005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000018007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000018008 linked-bytes=90
  nop                                        ; linked-va=0x7fe000018009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001800a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001800b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001800c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001800d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001800e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001800f linked-bytes=90
  times 1024 - ($ - CreatePipe) db 0xcc

; export=SetHandleInformation ordinal=97 binding=syscall
SetHandleInformation:
  mov eax, 0x1061                            ; linked-va=0x7fe000018400 linked-bytes=b8 61 10 00 00
  syscall                                    ; linked-va=0x7fe000018405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000018407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000018408 linked-bytes=90
  nop                                        ; linked-va=0x7fe000018409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001840a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001840b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001840c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001840d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001840e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001840f linked-bytes=90
  times 1024 - ($ - SetHandleInformation) db 0xcc

; export=CreateFileW ordinal=98 binding=syscall
CreateFileW:
  mov eax, 0x1062                            ; linked-va=0x7fe000018800 linked-bytes=b8 62 10 00 00
  syscall                                    ; linked-va=0x7fe000018805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe000018807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe000018808 linked-bytes=90
  nop                                        ; linked-va=0x7fe000018809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00001880a linked-bytes=90
  nop                                        ; linked-va=0x7fe00001880b linked-bytes=90
  nop                                        ; linked-va=0x7fe00001880c linked-bytes=90
  nop                                        ; linked-va=0x7fe00001880d linked-bytes=90
  nop                                        ; linked-va=0x7fe00001880e linked-bytes=90
  nop                                        ; linked-va=0x7fe00001880f linked-bytes=90
  times 1024 - ($ - CreateFileW) db 0xcc
  times 102400 - ($ - $$) db 0xcc

section .rdata
; empty

section .data
; empty

section .bss
; empty
