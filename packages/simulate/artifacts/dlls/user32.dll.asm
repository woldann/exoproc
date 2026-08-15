; user32.dll / relocatable NASM source
; Assemble to a Win64 COFF object: nasm -f win64 <file>.asm
; COFF relocations mirror EXOPROC export relocation targets.
BITS 64
DEFAULT REL

global RegisterClassExW
global CreateWindowExW
global ShowWindow
global UpdateWindow
global GetMessageW
global PeekMessageW
global TranslateMessage
global DispatchMessageW
global PostQuitMessage
global DefWindowProcW
global BeginPaint
global EndPaint
global GetClientRect
global DrawTextW
global LoadCursorW
global LoadIconW
global FillRect
global InvalidateRect
global GetDC
global ReleaseDC
global GetSystemMetrics
global MessageBoxW
global SetTimer
global KillTimer
global GetWindowThreadProcessId
global GetWindowTextLengthW
global GetWindowTextW
global GetClassNameW
global IsIconic
global IsZoomed
global GetWindowRect
global GetGUIThreadInfo
global EnumWindows
global FindWindowW
global PostMessageW

section .text
; bytes=36864; loader chooses the image base and RVA

; export=RegisterClassExW ordinal=0 binding=syscall
RegisterClassExW:
  mov eax, 0x4000                            ; linked-va=0x7fe003000000 linked-bytes=b8 00 40 00 00
  syscall                                    ; linked-va=0x7fe003000005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003000007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003000008 linked-bytes=90
  nop                                        ; linked-va=0x7fe003000009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300000a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300000b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300000c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300000d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300000e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300000f linked-bytes=90
  times 1024 - ($ - RegisterClassExW) db 0xcc

; export=CreateWindowExW ordinal=1 binding=syscall
CreateWindowExW:
  mov eax, 0x4001                            ; linked-va=0x7fe003000400 linked-bytes=b8 01 40 00 00
  syscall                                    ; linked-va=0x7fe003000405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003000407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003000408 linked-bytes=90
  nop                                        ; linked-va=0x7fe003000409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300040a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300040b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300040c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300040d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300040e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300040f linked-bytes=90
  times 1024 - ($ - CreateWindowExW) db 0xcc

; export=ShowWindow ordinal=2 binding=syscall
ShowWindow:
  mov eax, 0x4002                            ; linked-va=0x7fe003000800 linked-bytes=b8 02 40 00 00
  syscall                                    ; linked-va=0x7fe003000805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003000807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003000808 linked-bytes=90
  nop                                        ; linked-va=0x7fe003000809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300080a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300080b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300080c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300080d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300080e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300080f linked-bytes=90
  times 1024 - ($ - ShowWindow) db 0xcc

; export=UpdateWindow ordinal=3 binding=syscall
UpdateWindow:
  mov eax, 0x4003                            ; linked-va=0x7fe003000c00 linked-bytes=b8 03 40 00 00
  syscall                                    ; linked-va=0x7fe003000c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003000c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003000c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe003000c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe003000c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe003000c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe003000c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe003000c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe003000c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe003000c0f linked-bytes=90
  times 1024 - ($ - UpdateWindow) db 0xcc

; export=GetMessageW ordinal=4 binding=syscall
GetMessageW:
  mov eax, 0x4004                            ; linked-va=0x7fe003001000 linked-bytes=b8 04 40 00 00
  syscall                                    ; linked-va=0x7fe003001005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003001007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003001008 linked-bytes=90
  nop                                        ; linked-va=0x7fe003001009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300100a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300100b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300100c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300100d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300100e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300100f linked-bytes=90
  times 1024 - ($ - GetMessageW) db 0xcc

; export=PeekMessageW ordinal=5 binding=syscall
PeekMessageW:
  mov eax, 0x4005                            ; linked-va=0x7fe003001400 linked-bytes=b8 05 40 00 00
  syscall                                    ; linked-va=0x7fe003001405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003001407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003001408 linked-bytes=90
  nop                                        ; linked-va=0x7fe003001409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300140a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300140b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300140c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300140d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300140e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300140f linked-bytes=90
  times 1024 - ($ - PeekMessageW) db 0xcc

; export=TranslateMessage ordinal=6 binding=syscall
TranslateMessage:
  mov eax, 0x4006                            ; linked-va=0x7fe003001800 linked-bytes=b8 06 40 00 00
  syscall                                    ; linked-va=0x7fe003001805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003001807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003001808 linked-bytes=90
  nop                                        ; linked-va=0x7fe003001809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300180a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300180b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300180c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300180d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300180e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300180f linked-bytes=90
  times 1024 - ($ - TranslateMessage) db 0xcc

; export=DispatchMessageW ordinal=7 binding=syscall
DispatchMessageW:
  mov eax, 0x4007                            ; linked-va=0x7fe003001c00 linked-bytes=b8 07 40 00 00
  syscall                                    ; linked-va=0x7fe003001c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003001c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003001c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe003001c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe003001c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe003001c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe003001c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe003001c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe003001c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe003001c0f linked-bytes=90
  times 1024 - ($ - DispatchMessageW) db 0xcc

; export=PostQuitMessage ordinal=8 binding=syscall
PostQuitMessage:
  mov eax, 0x4008                            ; linked-va=0x7fe003002000 linked-bytes=b8 08 40 00 00
  syscall                                    ; linked-va=0x7fe003002005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003002007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003002008 linked-bytes=90
  nop                                        ; linked-va=0x7fe003002009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300200a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300200b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300200c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300200d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300200e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300200f linked-bytes=90
  times 1024 - ($ - PostQuitMessage) db 0xcc

; export=DefWindowProcW ordinal=9 binding=syscall
DefWindowProcW:
  mov eax, 0x4009                            ; linked-va=0x7fe003002400 linked-bytes=b8 09 40 00 00
  syscall                                    ; linked-va=0x7fe003002405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003002407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003002408 linked-bytes=90
  nop                                        ; linked-va=0x7fe003002409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300240a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300240b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300240c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300240d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300240e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300240f linked-bytes=90
  times 1024 - ($ - DefWindowProcW) db 0xcc

; export=BeginPaint ordinal=10 binding=syscall
BeginPaint:
  mov eax, 0x400a                            ; linked-va=0x7fe003002800 linked-bytes=b8 0a 40 00 00
  syscall                                    ; linked-va=0x7fe003002805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003002807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003002808 linked-bytes=90
  nop                                        ; linked-va=0x7fe003002809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300280a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300280b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300280c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300280d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300280e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300280f linked-bytes=90
  times 1024 - ($ - BeginPaint) db 0xcc

; export=EndPaint ordinal=11 binding=syscall
EndPaint:
  mov eax, 0x400b                            ; linked-va=0x7fe003002c00 linked-bytes=b8 0b 40 00 00
  syscall                                    ; linked-va=0x7fe003002c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003002c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003002c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe003002c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe003002c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe003002c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe003002c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe003002c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe003002c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe003002c0f linked-bytes=90
  times 1024 - ($ - EndPaint) db 0xcc

; export=GetClientRect ordinal=12 binding=syscall
GetClientRect:
  mov eax, 0x400c                            ; linked-va=0x7fe003003000 linked-bytes=b8 0c 40 00 00
  syscall                                    ; linked-va=0x7fe003003005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003003007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003003008 linked-bytes=90
  nop                                        ; linked-va=0x7fe003003009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300300a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300300b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300300c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300300d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300300e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300300f linked-bytes=90
  times 1024 - ($ - GetClientRect) db 0xcc

; export=DrawTextW ordinal=13 binding=syscall
DrawTextW:
  mov eax, 0x400d                            ; linked-va=0x7fe003003400 linked-bytes=b8 0d 40 00 00
  syscall                                    ; linked-va=0x7fe003003405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003003407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003003408 linked-bytes=90
  nop                                        ; linked-va=0x7fe003003409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300340a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300340b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300340c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300340d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300340e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300340f linked-bytes=90
  times 1024 - ($ - DrawTextW) db 0xcc

; export=LoadCursorW ordinal=14 binding=syscall
LoadCursorW:
  mov eax, 0x400e                            ; linked-va=0x7fe003003800 linked-bytes=b8 0e 40 00 00
  syscall                                    ; linked-va=0x7fe003003805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003003807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003003808 linked-bytes=90
  nop                                        ; linked-va=0x7fe003003809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300380a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300380b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300380c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300380d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300380e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300380f linked-bytes=90
  times 1024 - ($ - LoadCursorW) db 0xcc

; export=LoadIconW ordinal=15 binding=syscall
LoadIconW:
  mov eax, 0x400f                            ; linked-va=0x7fe003003c00 linked-bytes=b8 0f 40 00 00
  syscall                                    ; linked-va=0x7fe003003c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003003c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003003c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe003003c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe003003c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe003003c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe003003c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe003003c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe003003c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe003003c0f linked-bytes=90
  times 1024 - ($ - LoadIconW) db 0xcc

; export=FillRect ordinal=16 binding=syscall
FillRect:
  mov eax, 0x4010                            ; linked-va=0x7fe003004000 linked-bytes=b8 10 40 00 00
  syscall                                    ; linked-va=0x7fe003004005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003004007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003004008 linked-bytes=90
  nop                                        ; linked-va=0x7fe003004009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300400a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300400b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300400c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300400d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300400e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300400f linked-bytes=90
  times 1024 - ($ - FillRect) db 0xcc

; export=InvalidateRect ordinal=17 binding=syscall
InvalidateRect:
  mov eax, 0x4011                            ; linked-va=0x7fe003004400 linked-bytes=b8 11 40 00 00
  syscall                                    ; linked-va=0x7fe003004405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003004407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003004408 linked-bytes=90
  nop                                        ; linked-va=0x7fe003004409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300440a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300440b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300440c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300440d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300440e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300440f linked-bytes=90
  times 1024 - ($ - InvalidateRect) db 0xcc

; export=GetDC ordinal=18 binding=syscall
GetDC:
  mov eax, 0x4012                            ; linked-va=0x7fe003004800 linked-bytes=b8 12 40 00 00
  syscall                                    ; linked-va=0x7fe003004805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003004807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003004808 linked-bytes=90
  nop                                        ; linked-va=0x7fe003004809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300480a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300480b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300480c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300480d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300480e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300480f linked-bytes=90
  times 1024 - ($ - GetDC) db 0xcc

; export=ReleaseDC ordinal=19 binding=syscall
ReleaseDC:
  mov eax, 0x4013                            ; linked-va=0x7fe003004c00 linked-bytes=b8 13 40 00 00
  syscall                                    ; linked-va=0x7fe003004c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003004c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003004c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe003004c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe003004c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe003004c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe003004c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe003004c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe003004c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe003004c0f linked-bytes=90
  times 1024 - ($ - ReleaseDC) db 0xcc

; export=GetSystemMetrics ordinal=20 binding=syscall
GetSystemMetrics:
  mov eax, 0x4014                            ; linked-va=0x7fe003005000 linked-bytes=b8 14 40 00 00
  syscall                                    ; linked-va=0x7fe003005005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003005007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003005008 linked-bytes=90
  nop                                        ; linked-va=0x7fe003005009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300500a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300500b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300500c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300500d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300500e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300500f linked-bytes=90
  times 1024 - ($ - GetSystemMetrics) db 0xcc

; export=MessageBoxW ordinal=21 binding=syscall
MessageBoxW:
  mov eax, 0x4015                            ; linked-va=0x7fe003005400 linked-bytes=b8 15 40 00 00
  syscall                                    ; linked-va=0x7fe003005405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003005407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003005408 linked-bytes=90
  nop                                        ; linked-va=0x7fe003005409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300540a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300540b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300540c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300540d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300540e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300540f linked-bytes=90
  times 1024 - ($ - MessageBoxW) db 0xcc

; export=SetTimer ordinal=22 binding=syscall
SetTimer:
  mov eax, 0x4016                            ; linked-va=0x7fe003005800 linked-bytes=b8 16 40 00 00
  syscall                                    ; linked-va=0x7fe003005805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003005807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003005808 linked-bytes=90
  nop                                        ; linked-va=0x7fe003005809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300580a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300580b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300580c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300580d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300580e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300580f linked-bytes=90
  times 1024 - ($ - SetTimer) db 0xcc

; export=KillTimer ordinal=23 binding=syscall
KillTimer:
  mov eax, 0x4017                            ; linked-va=0x7fe003005c00 linked-bytes=b8 17 40 00 00
  syscall                                    ; linked-va=0x7fe003005c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003005c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003005c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe003005c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe003005c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe003005c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe003005c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe003005c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe003005c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe003005c0f linked-bytes=90
  times 1024 - ($ - KillTimer) db 0xcc

; export=GetWindowThreadProcessId ordinal=24 binding=syscall
GetWindowThreadProcessId:
  mov eax, 0x4018                            ; linked-va=0x7fe003006000 linked-bytes=b8 18 40 00 00
  syscall                                    ; linked-va=0x7fe003006005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003006007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003006008 linked-bytes=90
  nop                                        ; linked-va=0x7fe003006009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300600a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300600b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300600c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300600d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300600e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300600f linked-bytes=90
  times 1024 - ($ - GetWindowThreadProcessId) db 0xcc

; export=GetWindowTextLengthW ordinal=25 binding=syscall
GetWindowTextLengthW:
  mov eax, 0x4019                            ; linked-va=0x7fe003006400 linked-bytes=b8 19 40 00 00
  syscall                                    ; linked-va=0x7fe003006405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003006407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003006408 linked-bytes=90
  nop                                        ; linked-va=0x7fe003006409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300640a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300640b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300640c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300640d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300640e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300640f linked-bytes=90
  times 1024 - ($ - GetWindowTextLengthW) db 0xcc

; export=GetWindowTextW ordinal=26 binding=syscall
GetWindowTextW:
  mov eax, 0x401a                            ; linked-va=0x7fe003006800 linked-bytes=b8 1a 40 00 00
  syscall                                    ; linked-va=0x7fe003006805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003006807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003006808 linked-bytes=90
  nop                                        ; linked-va=0x7fe003006809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300680a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300680b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300680c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300680d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300680e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300680f linked-bytes=90
  times 1024 - ($ - GetWindowTextW) db 0xcc

; export=GetClassNameW ordinal=27 binding=syscall
GetClassNameW:
  mov eax, 0x401b                            ; linked-va=0x7fe003006c00 linked-bytes=b8 1b 40 00 00
  syscall                                    ; linked-va=0x7fe003006c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003006c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003006c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe003006c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe003006c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe003006c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe003006c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe003006c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe003006c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe003006c0f linked-bytes=90
  times 1024 - ($ - GetClassNameW) db 0xcc

; export=IsIconic ordinal=28 binding=syscall
IsIconic:
  mov eax, 0x401c                            ; linked-va=0x7fe003007000 linked-bytes=b8 1c 40 00 00
  syscall                                    ; linked-va=0x7fe003007005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003007007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003007008 linked-bytes=90
  nop                                        ; linked-va=0x7fe003007009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300700a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300700b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300700c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300700d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300700e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300700f linked-bytes=90
  times 1024 - ($ - IsIconic) db 0xcc

; export=IsZoomed ordinal=29 binding=syscall
IsZoomed:
  mov eax, 0x401d                            ; linked-va=0x7fe003007400 linked-bytes=b8 1d 40 00 00
  syscall                                    ; linked-va=0x7fe003007405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003007407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003007408 linked-bytes=90
  nop                                        ; linked-va=0x7fe003007409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300740a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300740b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300740c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300740d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300740e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300740f linked-bytes=90
  times 1024 - ($ - IsZoomed) db 0xcc

; export=GetWindowRect ordinal=30 binding=syscall
GetWindowRect:
  mov eax, 0x401e                            ; linked-va=0x7fe003007800 linked-bytes=b8 1e 40 00 00
  syscall                                    ; linked-va=0x7fe003007805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003007807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003007808 linked-bytes=90
  nop                                        ; linked-va=0x7fe003007809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300780a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300780b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300780c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300780d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300780e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300780f linked-bytes=90
  times 1024 - ($ - GetWindowRect) db 0xcc

; export=GetGUIThreadInfo ordinal=31 binding=syscall
GetGUIThreadInfo:
  mov eax, 0x401f                            ; linked-va=0x7fe003007c00 linked-bytes=b8 1f 40 00 00
  syscall                                    ; linked-va=0x7fe003007c05 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003007c07 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003007c08 linked-bytes=90
  nop                                        ; linked-va=0x7fe003007c09 linked-bytes=90
  nop                                        ; linked-va=0x7fe003007c0a linked-bytes=90
  nop                                        ; linked-va=0x7fe003007c0b linked-bytes=90
  nop                                        ; linked-va=0x7fe003007c0c linked-bytes=90
  nop                                        ; linked-va=0x7fe003007c0d linked-bytes=90
  nop                                        ; linked-va=0x7fe003007c0e linked-bytes=90
  nop                                        ; linked-va=0x7fe003007c0f linked-bytes=90
  times 1024 - ($ - GetGUIThreadInfo) db 0xcc

; export=EnumWindows ordinal=32 binding=syscall
EnumWindows:
  mov eax, 0x4020                            ; linked-va=0x7fe003008000 linked-bytes=b8 20 40 00 00
  syscall                                    ; linked-va=0x7fe003008005 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003008007 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003008008 linked-bytes=90
  nop                                        ; linked-va=0x7fe003008009 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300800a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300800b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300800c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300800d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300800e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300800f linked-bytes=90
  times 1024 - ($ - EnumWindows) db 0xcc

; export=FindWindowW ordinal=33 binding=syscall
FindWindowW:
  mov eax, 0x4021                            ; linked-va=0x7fe003008400 linked-bytes=b8 21 40 00 00
  syscall                                    ; linked-va=0x7fe003008405 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003008407 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003008408 linked-bytes=90
  nop                                        ; linked-va=0x7fe003008409 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300840a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300840b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300840c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300840d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300840e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300840f linked-bytes=90
  times 1024 - ($ - FindWindowW) db 0xcc

; export=PostMessageW ordinal=34 binding=syscall
PostMessageW:
  mov eax, 0x4022                            ; linked-va=0x7fe003008800 linked-bytes=b8 22 40 00 00
  syscall                                    ; linked-va=0x7fe003008805 linked-bytes=0f 05
  ret                                        ; linked-va=0x7fe003008807 linked-bytes=c3
  nop                                        ; linked-va=0x7fe003008808 linked-bytes=90
  nop                                        ; linked-va=0x7fe003008809 linked-bytes=90
  nop                                        ; linked-va=0x7fe00300880a linked-bytes=90
  nop                                        ; linked-va=0x7fe00300880b linked-bytes=90
  nop                                        ; linked-va=0x7fe00300880c linked-bytes=90
  nop                                        ; linked-va=0x7fe00300880d linked-bytes=90
  nop                                        ; linked-va=0x7fe00300880e linked-bytes=90
  nop                                        ; linked-va=0x7fe00300880f linked-bytes=90
  times 1024 - ($ - PostMessageW) db 0xcc
  times 36864 - ($ - $$) db 0xcc

section .rdata
; empty

section .data
; empty

section .bss
; empty
