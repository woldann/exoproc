import { expect, test, describe } from 'bun:test';
import {
  cjitopen,
  CType,
  NamedPipeCallableAccessor,
  RemoteCallableMemoryAccessor,
  MsvcrtImpl,
  HostAccessor,
} from '../../packages/xffi/src/index.js';
import {
  currentProcessId,
  resolveAddress,
} from '../../packages/xffi/src/ffi.js';
import { TestProcess } from '../helpers.js';

describe('xffi > NamedPipeCallableAccessor', () => {
  test('should execute machineCode and retrieve 64-bit result via named pipe in local process', async () => {
    console.log('Local test starting...');
    // 1. Create a dummy function in the current process
    // that returns an i64 (which the standard callable accessor normally can't capture)
    const targetLib = cjitopen({
      get_big_secret: {
        args: [CType.i64],
        returns: CType.i64,
        source: `
          unsigned long long secret = 0xAAABBBCCCDDDULL;
          return secret + arg0;
        `,
      },
    });

    const targetFunc = targetLib.symbols.get_big_secret;
    console.log('Local function compiled.');

    // 2. Wrap the current process with NamedPipeCallableAccessor
    const base = new RemoteCallableMemoryAccessor(currentProcessId);
    const host = new HostAccessor(base);
    const accessor = new NamedPipeCallableAccessor(base, host);
    host.backend = accessor;
    console.log('Local accessor created.');

    // 3. Initiate the machineCode Call, ask it to add 0x111222333444ULL
    const param = 0x111222333444n;
    console.log('Calling local function via NamedPipeCallableAccessor...');
    const result = await accessor.call(targetFunc, param);
    console.log(`Local result: ${result}`);

    // Expected: 0xAAABBBCCCDDD + 0x111222333444 = 0xBBBDDEFFF221
    const expected = 0xaaabbbcccdddn + param;

    expect(result).toBe(expected);
    console.log('Local test assertion passed.');

    // Cleanup
    accessor.close();
    targetLib.close();
    console.log('Local test cleanup done.');
  }, 30000);

  test('should execute machineCode inside a remote ping process and retrieve an 8-byte (64-bit) u64 result', async () => {
    console.log('Remote test starting...');
    // 1. Spawn a ping process that runs for 20 seconds
    const tp = new TestProcess();
    const { pid } = tp;
    console.log(`Remote ping process started with PID: ${pid}`);

    try {
      // 2. Wrap the remote process with NamedPipeCallableAccessor
      const baseAccessor = new RemoteCallableMemoryAccessor(pid);
      const host = new HostAccessor(baseAccessor);
      const accessor = new NamedPipeCallableAccessor(baseAccessor, host);
      host.backend = accessor;
      console.log('Remote accessors created.');

      // Allocate a test string in the remote process's memory space using baseAccessor
      const testStr =
        'Hello from the host process! This is a 64-bit remote FFI test.';
      console.log('Allocating and writing remote string...');
      const remoteStrAddr = await baseAccessor.alloc(testStr.length + 1);
      await baseAccessor.write(remoteStrAddr, Buffer.from(testStr + '\0'));
      console.log(
        `Remote string written to 0x${resolveAddress(remoteStrAddr).toString(16)}`,
      );

      try {
        // 3. Initiate the machineCode Call to msvcrt!strlen in the remote process
        // passing the 64-bit remote address as an argument
        const targetFunc = MsvcrtImpl.strlen;
        console.log('Calling remote strlen via NamedPipeCallableAccessor...');
        const result = await accessor.call(targetFunc, remoteStrAddr);
        console.log(`Remote result: ${result}`);

        // Expected: The 64-bit (8-byte) result returned from remote strlen
        // must exactly match the length of the string as a BigInt.
        expect(result).toBe(BigInt(testStr.length));
        console.log('Remote assertion passed.');
      } finally {
        console.log('Freeing remote string and closing accessor...');
        await baseAccessor.free(remoteStrAddr);
        accessor.close();
      }
    } finally {
      // 4. Cleanup/kill spawned ping process
      console.log('Stopping remote ping process...');
      await tp.stop();
      console.log('Remote test completed.');
    }
  }, 30000);
});
