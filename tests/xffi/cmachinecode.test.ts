import { expect, test, describe } from 'bun:test';
import {
  cmachinecode,
  CType,
  RemoteCallableMemoryAccessor,
  createCFunction,
  currentProcessId,
  cjitopen,
} from '../../packages/xffi/src/index.js';
import { TestProcess } from '../helpers.js';

describe('xffi > cmachinecode Builder & Compiler', () => {
  test('should compile standard C code into standalone bytecode with automatic macro address patching and run it locally', async () => {
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

    const base = new RemoteCallableMemoryAccessor(currentProcessId);

    const param = 0x111222333444n;
    const result = await base.call(targetFunc, param);
    const expected = 0xaaabbbcccdddn + param;

    expect(result).toBe(expected);

    base.close();
    targetLib.close();
  });

  test('should compile standard C code into standalone bytecode with automatic macro address patching and run it remotely', async () => {
    console.log('cmachinecode: Starting remote test...');
    const shell = cmachinecode({
      source: `
        void* ptr = VirtualAlloc(0, 1024, 0x3000, 0x04);
        if (!ptr) return 0ULL;

        char* msg = (char*)ptr;
        msg[0] = 'V';
        msg[1] = 'i';
        msg[2] = 'r';
        msg[3] = 't';
        msg[4] = 'u';
        msg[5] = 'a';
        msg[6] = 'l';
        msg[7] = ' ';
        msg[8] = 'S';
        msg[9] = 'h';
        msg[10] = 'e';
        msg[11] = 'l';
        msg[12] = 'l';
        msg[13] = 'c';
        msg[14] = 'o';
        msg[15] = 'd';
        msg[16] = 'e';
        msg[17] = ' ';
        msg[18] = 'D';
        msg[19] = 'i';
        msg[20] = 'r';
        msg[21] = 'e';
        msg[22] = 'c';
        msg[23] = 't';
        msg[24] = ' ';
        msg[25] = 'A';
        msg[26] = 'd';
        msg[27] = 'd';
        msg[28] = 'r';
        msg[29] = 'e';
        msg[30] = 's';
        msg[31] = 's';
        msg[32] = ' ';
        msg[33] = 'P';
        msg[34] = 'a';
        msg[35] = 't';
        msg[36] = 'c';
        msg[37] = 'h';
        msg[38] = 'i';
        msg[39] = 'n';
        msg[40] = 'g';
        msg[41] = ' ';
        msg[42] = 'W';
        msg[43] = 'o';
        msg[44] = 'r';
        msg[45] = 'k';
        msg[46] = 's';
        msg[47] = '!';
        msg[48] = '\\0';

        VirtualFree(ptr, 0, 0x8000);

        return 48ULL;
      `,
      returns: CType.u64,
      args: [],
    });
    // 1. Spawn a remote process
    console.log('cmachinecode: Starting remote test...');
    const tp = new TestProcess();
    const { pid } = tp;
    console.log(`cmachinecode: Spawned ping.exe process with PID: ${pid}`);

    try {
      // 2. Setup the accessor
      console.log('cmachinecode: Initializing accessor...');
      const baseAccessor = new RemoteCallableMemoryAccessor(pid);
      console.log('cmachinecode: Accessor initialized.');

      try {
        // 3. Write/inject machineCode to the target process
        console.log('cmachinecode: Injecting machineCode to target process...');
        const remoteAddr = await shell.machineCode(baseAccessor);
        console.log(
          `cmachinecode: Injected remote address: 0x${remoteAddr.toString(16)}`,
        );
        expect(Number(remoteAddr)).toBeGreaterThan(0);

        // 4. Call the remote machineCode
        console.log('cmachinecode: Creating CFunction wrapper...');
        const remoteFunc = createCFunction(remoteAddr, [CType.u64, []]);
        console.log('cmachinecode: Calling remote machineCode...');
        const result = await baseAccessor.call(remoteFunc);
        console.log(`cmachinecode: Execution completed. Result: ${result}`);

        // The length of "Virtual MachineCode Direct Address Patching Works!" is 48
        expect(result).toBe(48n);
        console.log('cmachinecode: Assertion passed.');
      } finally {
        console.log('cmachinecode: Closing accessor...');
        baseAccessor.close();
      }
    } finally {
      console.log('cmachinecode: Stopping remote ping process...');
      await tp.stop();
      console.log('cmachinecode: Stopped remote ping process.');
    }
  });
});
