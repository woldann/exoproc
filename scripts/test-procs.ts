import { ToolhelpSnapshot, Window } from 'bun-winapi';
import { ToolhelpSnapshotFlag } from 'bun-xffi';

const snap = new ToolhelpSnapshot(ToolhelpSnapshotFlag.SNAPPROCESS);
console.log('--- ALL PROCESSES ---');
for (const p of snap.getProcesses()) {
  console.log(`PID: ${p.pid} (0x${p.pid.toString(16)}) -> Name: ${p.name}`);
}
snap.close();

console.log('--- ALL WINDOWS ---');
try {
  const wins = Window.getWindows(256);
  for (const w of wins) {
    try {
      const [_t, pid] = w.getThreadProcessId();
      console.log(`Window PID: ${pid} -> Title: "${w.getText()}"`);
    } catch (e: any) {
      console.log('Win error:', e.message);
    }
  }
} catch (e: any) {
  console.log('GetWindows error:', e.message);
}
