import { expect, test, describe } from 'bun:test';
import * as Native from 'bun-winapi';
import {
  cmachinecode,
  CType,
  createCFunction,
  RedirectorHostAccessor,
  HostAccessor,
} from 'bun-xffi';
import { NThread } from 'bun-nthread';
import { TestProcess } from '../helpers.js';

// Moved from tests/xffi/cmachinecode.test.ts. The original shell called
// VirtualAlloc/VirtualFree *from inside the injected code itself* -- that
// pattern was only ever proven safe over the old NamedPipeCallableAccessor
// (whose calls ran on one already-live, already-warmed-up loop thread). Over
// NThread's redirect-hijack, a thread pulled out of whatever it was doing and
// pointed straight at a nested real WinAPI call is untested territory and
// crashed Wine in CI. Sidestep it entirely: allocate the scratch buffer via a
// plain alloc() (a reliable VirtualAllocEx call from our own process, no
// thread execution involved) and pass it in as an argument -- the injected
// shell only ever touches memory, never makes its own WinAPI calls.
describe('nthread > cmachinecode remote execution', () => {
  test('should compile standard C code into standalone bytecode with automatic macro address patching and run it remotely', async () => {
    const shell = cmachinecode({
      source: `
        char* msg = (char*)arg0;
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

        return 48ULL;
      `,
      returns: CType.u64,
      args: [CType.ptr],
    });

    const tp = new TestProcess();
    const thread = Native.Thread.getThreads(tp.pid)[0];
    if (!thread) throw new Error('No thread found in the spawned process');

    const redirector = new RedirectorHostAccessor(tp.pid);
    const nthread = new NThread(
      tp.pid,
      thread.tid,
      { timeoutMs: 20000 },
      redirector,
    );
    const host = new HostAccessor(nthread);
    // RedirectorHostAccessor only routes the top-level async ops through
    // `target` -- sync scalar helpers bypass it and go straight to
    // `this.backend`, which defaults to a throwing dummy. Must wire both.
    redirector.backend = nthread;
    redirector.target = host;

    try {
      const bufAddr = await host.alloc(64);
      const remoteAddr = await shell.machineCode(host);
      expect(Number(remoteAddr)).toBeGreaterThan(0);

      const remoteFunc = createCFunction(remoteAddr, [CType.u64, [CType.ptr]]);
      const result = await host.call(remoteFunc, bufAddr);

      // The length of "Virtual MachineCode Direct Address Patching Works!" is 48
      expect(result).toBe(48n);

      await host.free(bufAddr);
    } finally {
      await host.deinit();
      await tp.stop();
    }
  }, 60000);
});
