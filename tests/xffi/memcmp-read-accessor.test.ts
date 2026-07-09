import { expect, test, describe } from 'bun:test';
import {
  MemcmpReadAccessor,
  localCallableMemoryAccessor,
  type ICallableMemoryAccessor,
  type CFunction,
  type CCallResult,
  HostAccessor,
} from '../../packages/xffi/src/index.js';
import { resolveAddress } from '../../packages/xffi/src/ffi.js';

describe('xffi > MemcmpReadAccessor', () => {
  test('should resolve memory correctly byte-by-byte using memcmp binary search', async () => {
    let callCount = 0;
    const spyBackend: ICallableMemoryAccessor = {
      isLocal: localCallableMemoryAccessor.isLocal,
      processId: localCallableMemoryAccessor.processId,
      enableDebug: () => {},
      disableDebug: () => {},

      read: (addr, size, offset) =>
        localCallableMemoryAccessor.read(addr, size, offset),
      write: (addr, data, offset) =>
        localCallableMemoryAccessor.write(addr, data, offset),
      alloc: (size, addr, prot, type) =>
        localCallableMemoryAccessor.alloc(size, addr, prot, type),
      allocNear: (target, size, options) =>
        localCallableMemoryAccessor.allocNear(target, size, options),
      free: (addr, size, type) =>
        localCallableMemoryAccessor.free(addr, size, type),
      protect: (addr, size, prot) =>
        localCallableMemoryAccessor.protect(addr, size, prot),
      query: (addr) => localCallableMemoryAccessor.query(addr),
      scan: (addr, size, pat) =>
        localCallableMemoryAccessor.scan(addr, size, pat),
      machineCode: (sc) => localCallableMemoryAccessor.machineCode(sc),

      call: async (func: CFunction, ...args: any[]): Promise<CCallResult> => {
        callCount++;
        return localCallableMemoryAccessor.call(func, ...args);
      },

      readInt8: (addr, offset) =>
        localCallableMemoryAccessor.readInt8(addr, offset),
      readUInt8: (addr, offset) =>
        localCallableMemoryAccessor.readUInt8(addr, offset),
      readInt16: (addr, offset) =>
        localCallableMemoryAccessor.readInt16(addr, offset),
      readUInt16: (addr, offset) =>
        localCallableMemoryAccessor.readUInt16(addr, offset),
      readInt32: (addr, offset) =>
        localCallableMemoryAccessor.readInt32(addr, offset),
      readUInt32: (addr, offset) =>
        localCallableMemoryAccessor.readUInt32(addr, offset),
      readInt64: (addr, offset) =>
        localCallableMemoryAccessor.readInt64(addr, offset),
      readUInt64: (addr, offset) =>
        localCallableMemoryAccessor.readUInt64(addr, offset),
      readFloat: (addr, offset) =>
        localCallableMemoryAccessor.readFloat(addr, offset),
      readDouble: (addr, offset) =>
        localCallableMemoryAccessor.readDouble(addr, offset),
      readPointer: (addr, offset) =>
        localCallableMemoryAccessor.readPointer(addr, offset),

      writeInt8: (addr, val, offset) =>
        localCallableMemoryAccessor.writeInt8(addr, val, offset),
      writeUInt8: (addr, val, offset) =>
        localCallableMemoryAccessor.writeUInt8(addr, val, offset),
      writeInt16: (addr, val, offset) =>
        localCallableMemoryAccessor.writeInt16(addr, val, offset),
      writeUInt16: (addr, val, offset) =>
        localCallableMemoryAccessor.writeUInt16(addr, val, offset),
      writeInt32: (addr, val, offset) =>
        localCallableMemoryAccessor.writeInt32(addr, val, offset),
      writeUInt32: (addr, val, offset) =>
        localCallableMemoryAccessor.writeUInt32(addr, val, offset),
      writeInt64: (addr, val, offset) =>
        localCallableMemoryAccessor.writeInt64(addr, val, offset),
      writeUInt64: (addr, val, offset) =>
        localCallableMemoryAccessor.writeUInt64(addr, val, offset),
      writeFloat: (addr, val, offset) =>
        localCallableMemoryAccessor.writeFloat(addr, val, offset),
      writeDouble: (addr, val, offset) =>
        localCallableMemoryAccessor.writeDouble(addr, val, offset),
      writePointer: (addr, val, offset) =>
        localCallableMemoryAccessor.writePointer(addr, val, offset),
    };

    const host = new HostAccessor(spyBackend);
    const accessor = new MemcmpReadAccessor(spyBackend, host);
    host.backend = accessor;

    await host.init();

    const testStr = 'Memcmp!';
    const testBuf = Buffer.from(testStr);
    const testAddr = resolveAddress(testBuf);

    const readResult = await accessor.read(testAddr, testBuf.length);
    // Compare against `testBuf` itself (not just re-deriving the string) so
    // the buffer stays referenced across the many async memcmp round-trips
    // above -- `resolveAddress` resolves to a raw address via bun:ffi's
    // `ptr()`, which does not pin the buffer, so nothing else keeps it alive
    // during the read and the GC is otherwise free to reclaim/move it,
    // corrupting the blind byte-by-byte comparison mid-flight.
    expect(readResult.equals(testBuf)).toBe(true);
    expect(readResult.toString()).toBe(testStr);

    // We resolved 7 bytes. Each byte search takes ~8 comparisons.
    expect(callCount).toBeGreaterThan(0);

    host.close();
  });
});
