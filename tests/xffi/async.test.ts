import { expect, test, describe } from 'bun:test';
import { cjitopen, CType } from '../../packages/xffi/src/index.js';

describe.skip('xffi > callAsync', () => {
  test('should execute native functions asynchronously and support parallel execution via thread pool', async () => {
    const lib = cjitopen({
      __headers__: {
        args: [],
        returns: CType.void,
        source: `
          }
          #ifndef _WIN32
            #include <unistd.h>
            #define Sleep(ms) usleep((ms) * 1000)
          #endif
          void __headers_dummy() {
        `,
      },
      slow_add: {
        args: [CType.i32, CType.i32],
        returns: CType.i32,
        source: `
          Sleep(500); // Sleep for 500ms
          return arg0 + arg1;
        `,
      },
    });

    const fn = lib.symbols.slow_add;

    // Warm up the generic thread pool (initial JIT compilation can be slow in Wine)
    await fn.callAsync(0, 0);

    const start = Date.now();

    // Fire two slow additions in parallel!
    const p1 = fn.callAsync(15, 25);
    const p2 = fn.callAsync(100, 200);

    const [r1, r2] = await Promise.all([p1, p2]);

    const duration = Date.now() - start;

    expect(r1).toBe(40);
    expect(r2).toBe(300);

    // If executed in sequence: 500ms + 500ms = 1000ms.
    // If executed in parallel (our thread pool is active): it should take ~500ms - 800ms!
    console.log(
      `\n[callAsync Parallel Test] Completed 2x 500ms calls in: ${duration} ms`,
    );
    expect(duration).toBeLessThan(900); // Verifies parallel scaling!

    lib.close();
  });

  test('should handle dynamic compilation for higher argument counts (7 args)', async () => {
    const lib = cjitopen({
      add_7_args: {
        args: [
          CType.i32,
          CType.i32,
          CType.i32,
          CType.i32,
          CType.i32,
          CType.i32,
          CType.i32,
        ],
        returns: CType.i32,
        source: `
          return arg0 + arg1 + arg2 + arg3 + arg4 + arg5 + arg6;
        `,
      },
    });

    const fn = lib.symbols.add_7_args;
    // This will trigger the dynamic compilation of all 7-arg variations (batching)
    const result = await fn.callAsync(1, 1, 1, 1, 1, 1, 1);

    expect(result).toBe(7);

    lib.close();
  });

  test('should handle float and double arguments and return types', async () => {
    const lib = cjitopen({
      add_floats: {
        args: [CType.float, CType.double],
        returns: CType.double,
        source: `
          return (double)arg0 + arg1;
        `,
      },
    });

    const fn = lib.symbols.add_floats;
    const result = await fn.callAsync(1.5, 2.5);

    expect(result).toBe(4.0);

    lib.close();
  });

  test('should handle pointer and string arguments and return types', async () => {
    const lib = cjitopen({
      process_string: {
        args: [CType.cstring],
        returns: CType.u8,
        source: `
          return (unsigned char)arg0[0];
        `,
      },
    });

    const fn = lib.symbols.process_string;
    const result = await fn.callAsync('Exoproc');

    expect(result).toBe('E'.charCodeAt(0));

    lib.close();
  });

  test('should support void returns', async () => {
    const lib = cjitopen({
      dummy_void: {
        args: [],
        returns: CType.void,
        source: `
          // Do nothing
        `,
      },
    });

    const fn = lib.symbols.dummy_void;
    const result = await fn.callAsync();

    expect(result).toBeUndefined();

    lib.close();
  });

  test('should lazily initialize callAsync and handle close() safely under various conditions', async () => {
    const lib = cjitopen({
      test_fn: {
        args: [],
        returns: CType.void,
        source: `
          // Do nothing
        `,
      },
    });

    const fn = lib.symbols.test_fn;

    // 1. Initially, wrapper.callAsync has no .close method because it's the lazy placeholder
    expect(typeof (fn.callAsync as any).close).toBe('undefined');

    // 2. Calling fn.close() when callAsync was never invoked should be a safe no-op
    expect(() => fn.close()).not.toThrow();

    // 3. Invoke callAsync
    const promise = fn.callAsync();
    // Now it should have been initialized, and wrapper.callAsync is overwritten with realCallAsync
    expect(typeof (fn.callAsync as any).close).toBe('function');

    await promise;

    // 4. Calling fn.close() now should close the callback successfully and restore callAsync back to lazy placeholder
    expect(() => fn.close()).not.toThrow();
    expect(typeof (fn.callAsync as any).close).toBe('undefined');

    // 5. It should be possible to re-initialize callAsync and run again!
    const promise2 = fn.callAsync();
    expect(typeof (fn.callAsync as any).close).toBe('function');
    await promise2;

    // 6. Calling fn.close() again should be safe, cleanup the second callback, and restore to lazy again
    expect(() => fn.close()).not.toThrow();
    expect(typeof (fn.callAsync as any).close).toBe('undefined');

    lib.close();
  });
});
