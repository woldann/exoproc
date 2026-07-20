# Troubleshooting

Treat an error together with the stage where it occurred. NThread, accessors, and hooks operate on the same target process, so one timeout symptom can have different causes.

For `NoSleepAddressError`, `NoPushretAddressError`, or `NoJumpAddressError`, verify Windows x64, `ntdll`/`kernel32`/`kernelbase`, and completed async initialization. For `CallTimeoutError`, inspect the address, signature, thread state, and suspend ownership before increasing the timeout. For `CallThreadDiedError`, use a fresh target and isolate the call with a small returning function.

If `expectedRsp` is set, both `call()` and `callSync()` warn on a return-stack mismatch. Record PID, driving thread ID, target address, first bytes, argument types, `RIP`, `RSP`, argument registers, result register, timeout result, and thread exit state in hexadecimal-safe form.
