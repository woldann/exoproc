import { expect, test, describe, afterAll } from 'bun:test';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import {
  AGENT_SLOTS,
  getPortForSlot,
  getSlotForPort,
  checkAgentSlot,
  checkAllAgentSlots,
  getActiveTarget,
  setActiveTarget,
  clearActiveTarget,
  getSessionPath,
  listSavedSessions,
  selectTarget,
  withActiveAccessor,
} from '../../packages/exoproc/src/session.js';
import { getGlobalDummyProcess } from '@woldann/exoproc-dummy';
import { createAccessor } from '@woldann/exoproc-accessors';

describe('Exoproc Target Management and 3 Agent Slots', () => {
  afterAll(() => {
    clearActiveTarget();
  });

  test('3 Agent Slots have sequential fixed ports (43378, 43379, 43380)', () => {
    expect(AGENT_SLOTS.length).toBe(3);
    expect(AGENT_SLOTS[0]).toBe(43378);
    expect(AGENT_SLOTS[1]).toBe(43379);
    expect(AGENT_SLOTS[2]).toBe(43380);

    expect(getPortForSlot(1)).toBe(43378);
    expect(getPortForSlot(2)).toBe(43379);
    expect(getPortForSlot(3)).toBe(43380);

    expect(getSlotForPort(43378)).toBe(1);
    expect(getSlotForPort(43379)).toBe(2);
    expect(getSlotForPort(43380)).toBe(3);
    expect(getSlotForPort(99999)).toBeNull();
  });

  test('checkAllAgentSlots probes all 3 slots', async () => {
    const slots = await checkAllAgentSlots('127.0.0.1', 200);
    expect(slots.length).toBe(3);
    expect(slots[0].slot).toBe(1);
    expect(slots[0].port).toBe(43378);
    expect(slots[1].slot).toBe(2);
    expect(slots[1].port).toBe(43379);
    expect(slots[2].slot).toBe(3);
    expect(slots[2].port).toBe(43380);
  });

  test('Active target store manages accessor and agent selections', () => {
    clearActiveTarget();
    expect(getActiveTarget()).toBeNull();

    setActiveTarget({
      type: 'agent',
      slot: 2,
      port: 43379,
      updatedAt: new Date().toISOString(),
    });

    const active = getActiveTarget();
    expect(active).not.toBeNull();
    expect(active?.type).toBe('agent');
    if (active?.type === 'agent') {
      expect(active.slot).toBe(2);
      expect(active.port).toBe(43379);
    }

    clearActiveTarget();
    expect(getActiveTarget()).toBeNull();
  });

  test('listSavedSessions and selectTarget for accessor sessions', () => {
    const dummyPid = 99887;
    const sessionPath = getSessionPath(dummyPid);

    const mockSession = {
      version: 2,
      savedAt: new Date().toISOString(),
      processId: dummyPid,
      accessorType: 'IndirectNThreadHostAccessor',
      pipeline: [],
      metadata: { processName: 'test-craft.exe', windowTitle: 'Test World' },
    };

    writeFileSync(sessionPath, JSON.stringify(mockSession, null, 2), 'utf8');

    try {
      const sessions = listSavedSessions();
      const found = sessions.find((s) => s.pid === dummyPid);
      expect(found).toBeDefined();
      expect(found?.metadata?.processName).toBe('test-craft.exe');

      // Select target via PID number
      const selected = selectTarget(dummyPid);
      expect(selected).toBeDefined();

      const current = getActiveTarget();
      expect(current?.type).toBe('accessor');
      if (current?.type === 'accessor') {
        expect(current.pid).toBe(dummyPid);
        expect(current.processName).toBe('test-craft.exe');
      }
    } finally {
      clearActiveTarget();
      try {
        if (existsSync(sessionPath)) unlinkSync(sessionPath);
      } catch {}
    }
  });

  test('withActiveAccessor consumes session file on load, executes, and saves back under file lock', async () => {
    const proc = getGlobalDummyProcess();
    const sessionPath = getSessionPath(proc.pid);

    // 1. Initial attach: create accessor and save to cache
    const accessor = await createAccessor(proc.pid);
    accessor.setSessionMetadata('processName', 'dummy-ping.exe');
    await accessor.save(sessionPath);

    expect(existsSync(sessionPath)).toBe(true);

    setActiveTarget({
      type: 'accessor',
      pid: proc.pid,
      sessionPath,
      processName: 'dummy-ping.exe',
      updatedAt: new Date().toISOString(),
    });

    try {
      let fileExistedDuringExecution = true;

      // 2. Transactional execution with withActiveAccessor
      const result = await withActiveAccessor(async (activeAcc, path) => {
        // Inside callback, file MUST BE CONSUMED (DELETED)
        fileExistedDuringExecution = existsSync(path);

        // Verify active accessor is functional
        const buf = Buffer.from('transactional execution verified');
        const addr = await activeAcc.alloc(64);
        await activeAcc.write(addr, buf);
        const readBuf = await activeAcc.read(addr, buf.length);
        await activeAcc.free(addr);

        return readBuf.toString();
      });

      expect(fileExistedDuringExecution).toBe(false);
      expect(result).toBe('transactional execution verified');

      // 3. After callback completes, file MUST BE SAVED BACK
      expect(existsSync(sessionPath)).toBe(true);
    } finally {
      clearActiveTarget();
      try {
        if (existsSync(sessionPath)) unlinkSync(sessionPath);
      } catch {}
    }
  }, 40000);
});
