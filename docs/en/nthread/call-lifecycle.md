# NThread call lifecycle

One `NThread` manages one OS thread. With the factory path, thread selection happens during initialization and `createAccessor()` resolves only after that work completes.

Initialization waits for the required system-stub scans, captures general-purpose, control, and XMM state, and parks the thread. That snapshot helps restore execution but cannot undo target lock semantics.

## Two-stage return chain

NThread constructs its normal call return path by executing `push reg; ret` in two stages. Stage A uses `RSP = callRsp + 56` and `push spinStub; ret`, establishing the spin stub slot at `[callRsp + 48]`. Stage B uses `RSP = callRsp + 8` and `push addRsp28RetStub; ret`; its first return enters `add rsp, 0x28; ret` and its second return reaches the spin stub slot.

Those two consecutive returns execute the normal zero-stack-argument return route before a user call is dispatched. They establish and validate the cleanup, shadow-space skip, and known parked state that later calls rely on for stability.

For a call, NThread writes arguments, sets `RIP`, resumes the thread, and reads the result after it returns through this chain. `call()` polls asynchronously; `callSync()` busy-spins the JavaScript thread and is only suitable for near-immediate calls. Always deinitialize in `finally`; do not blindly reuse an accessor after a timeout or thread death.
