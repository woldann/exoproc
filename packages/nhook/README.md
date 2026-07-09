# bun-nhook

Allocation-free cross-process inline function hooking. It patches the target function with a 2-byte `EB FE` (`jmp $`) infinite loop to park entering threads. Parked threads are intercepted, handled in JS, and resumed on-the-fly.

## Installation

```bash
bun add bun-nhook
```

## Quick Start

```typescript
import { NHook } from 'bun-nhook';

const nhook = new NHook(pid);

// Create and enable the hook (writes 2 bytes EB FE at targetFn)
const hook = await nhook.create(memory, targetFn);
await hook.enable();

// Intercept entering threads
for (const hit of await nhook.poll()) {
  console.log('Intercepted thread!', hit.threadId);
  console.log('Arguments:', hit.args);

  // Resume the thread, optionally forcing a custom return value
  await nhook.resume(hit, 1337n);
}

await hook.disable(); // Restores original bytes
```

## How It Works

1. **Inline Patch**: When enabled, `nhook` replaces the first 2 bytes of the target function with `EB FE`.
2. **Thread Parking**: Any thread that enters the function gets stuck in a tight CPU sleep loop at the hook site.
3. **Polling & Interception**: `nhook.poll()` queries process threads, identifies parked threads, suspends them, decodes their registers/arguments, and queues them for JS handling.
4. **Instruction Simulation**: When resuming, `nhook` uses Capstone to decode and simulate the execution of the displaced prologue bytes in the host process, then redirects RIP to the remaining instruction body and resumes the thread. No remote memory is allocated for trampolines.
