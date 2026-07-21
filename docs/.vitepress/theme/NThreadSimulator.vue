<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';

type RegisterName =
  'rip' | 'rsp' | 'rax' | 'rbx' | 'rbp' | 'rcx' | 'rdx' | 'r8' | 'r9';
type Registers = Record<RegisterName, string>;
type Phase = 'native' | 'enabling' | 'active' | 'disabling';
type ThreadState = 'running' | 'suspending' | 'suspended' | 'resuming';

const props = withDefaults(defineProps<{ locale?: 'tr' | 'en' }>(), {
  locale: 'tr',
});
const isTr = computed(() => props.locale === 'tr');
const text = (tr: string, en: string) => (isTr.value ? tr : en);

const nativeCode = [
  ['0x00007FF6004012A0', 'mov rcx, [rbx+18h]'],
  ['0x00007FF6004012A4', 'test rcx, rcx'],
  ['0x00007FF6004012A7', 'je workerLoop'],
  ['0x00007FF6004012AD', 'call updateWorld'],
  ['0x00007FF6004012B2', 'add rax, 1'],
  ['0x00007FF6004012B6', 'jmp workerLoop'],
] as const;
const stubs = {
  jump: '0x00007FFC71A2B4D0',
  spin: '0x00007FFC70F81030',
  pushRet: '0x00007FFC705C91A0',
  pushRetRet: '0x00007FFC705C91A1',
  addRsp: '0x00007FFC71A845F0',
  addRspRet: '0x00007FFC71A845F4',
};
const callRsp = '0x000000A418F8B838';
const calls = [
  {
    name: 'demo.readThreadId',
    address: '0x00007FF600405000',
    code: [
      { address: '0x00007FF600405000', op: 'mov eax, gs:[48h]' },
      { address: '0x00007FF600405007', op: 'ret' },
    ],
    rcx: '0x0000000000000000',
    rdx: '0x0000000000000000',
    r8: '0x0000000000000000',
    result: '0x0000000000001A34',
  },
  {
    name: 'demo.queryPage',
    address: '0x00007FF600405060',
    code: [
      { address: '0x00007FF600405060', op: 'sub rsp, 38h' },
      { address: '0x00007FF600405064', op: 'call queryWorker' },
      { address: '0x00007FF600405069', op: 'add rsp, 38h' },
      { address: '0x00007FF60040506D', op: 'ret' },
    ],
    rcx: '0x000001F410000000',
    rdx: '0x000001F420003000',
    r8: '0x0000000000000030',
    result: '0x0000000000000030',
  },
  {
    name: 'demo.fillBuffer',
    address: '0x00007FF6004050C0',
    code: [
      { address: '0x00007FF6004050C0', op: 'mov r10, rcx' },
      { address: '0x00007FF6004050C3', op: 'mov rdi, rcx' },
      { address: '0x00007FF6004050C6', op: 'mov al, dl' },
      { address: '0x00007FF6004050C8', op: 'mov rcx, r8' },
      { address: '0x00007FF6004050CB', op: 'rep stosb' },
      { address: '0x00007FF6004050CD', op: 'mov rax, r10' },
      { address: '0x00007FF6004050D0', op: 'ret' },
    ],
    rcx: '0x000001F420001000',
    rdx: '0x000000000000002A',
    r8: '0x0000000000000004',
    result: '0x000001F420001000',
  },
  {
    name: 'demo.readCursor',
    address: '0x00007FF600405120',
    code: [
      { address: '0x00007FF600405120', op: 'sub rsp, 28h' },
      { address: '0x00007FF600405124', op: 'syscall' },
      { address: '0x00007FF600405126', op: 'add rsp, 28h' },
      { address: '0x00007FF60040512A', op: 'ret' },
    ],
    rcx: '0x000001F420002000',
    rdx: '0x0000000000000000',
    r8: '0x0000000000000000',
    result: '0x0000000000000001',
  },
] as const;

const live = reactive<Registers>({
  rip: nativeCode[0][0],
  rsp: '0x000000A418F8C8C0',
  rax: '0x0000000000000001',
  rbx: '0x000001F410002000',
  rbp: '0x000000A418F8C940',
  rcx: '0x000001F410004000',
  rdx: '0x0000000000000000',
  r8: '0x0000000000000000',
  r9: '0x0000000000000000',
});
const zeroRegisters: Registers = {
  rip: '0x0000000000000000',
  rsp: '0x0000000000000000',
  rax: '0x0000000000000000',
  rbx: '0x0000000000000000',
  rbp: '0x0000000000000000',
  rcx: '0x0000000000000000',
  rdx: '0x0000000000000000',
  r8: '0x0000000000000000',
  r9: '0x0000000000000000',
};
const saved = ref<Registers | null>(null);
const initialSnapshot = ref<Registers | null>(null);
const phase = ref<Phase>('native');
const threadState = ref<ThreadState>('running');
const contextAction = ref('idle');
const contextCopies = ref(0);
const contextBuffer = ref<Registers | null>(null);
const clock = ref(0);
const disableQueued = ref(false);
const nativeCursor = ref(0);
const capturedCursor = ref(0);
const transition = ref(0);
const callCursor = ref(0);
const instructionCursor = ref(0);
const activeCall = ref<(typeof calls)[number]>(calls[0]);
const eventLog = ref<string[]>([]);
const paused = ref(false);
const bufferFilled = ref(false);
const stringDestination = ref('0x0000000000000000');
const stringReturn = ref('0x0000000000000000');
const stringByte = ref(0);
const zeroFlag = ref(false);
const stackStageA = ref(false);
const stackStageB = ref(false);
const changedRegisters = ref<RegisterName[]>([]);
const instructionActive = ref(false);
const executedRip = ref(live.rip);
let timer: ReturnType<typeof setInterval> | undefined;

const registers: RegisterName[] = [
  'rip',
  'rsp',
  'rax',
  'rbx',
  'rbp',
  'rcx',
  'rdx',
  'r8',
  'r9',
];
const supportedInstructions = [
  'MOV',
  'TEST',
  'JE / JMP',
  'CALL',
  'PUSH',
  'RET',
  'ADD / SUB',
  'REP STOSB',
  'SYSCALL',
];
const addLog = (message: string) => {
  eventLog.value = [message, ...eventLog.value].slice(0, 7);
};
const hex64 = (value: bigint) =>
  `0x${value.toString(16).padStart(16, '0').toUpperCase()}`;
const addHex = (value: string, amount: bigint) => hex64(BigInt(value) + amount);
const copyRegisters = (source: Registers): Registers => ({ ...source });
const markInstruction = () => {
  instructionActive.value = true;
  executedRip.value = live.rip;
};
const restoreRegisters = (target: Registers) => {
  for (const name of registers) live[name] = target[name];
};
const getContext = (): Registers => {
  const context = copyRegisters(live);
  contextBuffer.value = copyRegisters(context);
  return context;
};
const setContext = (context: Registers) => {
  restoreRegisters(context);
  contextBuffer.value = copyRegisters(context);
};

const phaseLabel = computed(() => {
  if (phase.value === 'native')
    return text('NORMAL ÇALIŞMA', 'NATIVE EXECUTION');
  if (phase.value === 'enabling')
    return text('INIT / YAKALANIYOR', 'INIT / CAPTURING');
  if (phase.value === 'active') return text('NTHREAD ETKİN', 'NTHREAD ENABLED');
  return text('DEINIT / GERİ YÜKLENİYOR', 'DEINIT / RESTORING');
});

const statusText = computed(() => {
  if (phase.value === 'native')
    return text(
      'Thread uygulamanın kendi worker loop kodunda serbestçe ilerliyor.',
      "The thread is freely executing the application's worker loop.",
    );
  if (phase.value === 'enabling')
    return text(
      "Canlı CONTEXT yakalanıyor, RIP stub zincirine yönlendiriliyor ve çağrı stack'i kuruluyor.",
      'The live CONTEXT is captured, RIP is redirected through the stubs, and the call stack is prepared.',
    );
  if (phase.value === 'active')
    return text(
      'Thread çalışan EB FE spin döngüsündeyken NThread yalnız getContext() ve setContext() ile çağrı yönlendiriyor.',
      'While the thread runs in the EB FE spin loop, NThread dispatches calls using only getContext() and setContext().',
    );
  return text(
    "savedContext içindeki context grupları canlı thread'e geri uygulanıyor.",
    'The context groups in savedContext are being applied back to the live thread.',
  );
});

const cpuState = computed(() => {
  if (threadState.value === 'suspending') return 'SuspendThread()';
  if (threadState.value === 'suspended') return 'SUSPENDED';
  if (threadState.value === 'resuming') return 'ResumeThread()';
  if (phase.value !== 'native' && live.rip === stubs.spin)
    return paused.value
      ? 'RUNNING · SPIN · CLOCK PAUSED'
      : 'RUNNING · SPIN · EB FE';
  return paused.value ? 'RUNNING · CLOCK PAUSED' : 'RUNNING';
});

const clockLabel = computed(() => clock.value.toString().padStart(6, '0'));

const codeLines = computed(() => {
  const target = activeCall.value;
  if (nativeCode.some(([address]) => address === live.rip)) {
    return [
      { address: '', op: 'target.exe!workerLoop', group: true },
      ...nativeCode.map(([address, op]) => ({ address, op, group: false })),
    ];
  }
  if (live.rip === stubs.jump) {
    return [
      { address: '', op: 'ntdll.dll · jumpStub', group: true },
      { address: stubs.jump, op: 'jmp rbx', group: false },
    ];
  }
  if (live.rip === stubs.spin) {
    return [
      { address: '', op: 'kernel32.dll · spinStub', group: true },
      { address: stubs.spin, op: 'jmp $    ; EB FE', group: false },
    ];
  }
  if (live.rip === stubs.pushRet || live.rip === stubs.pushRetRet) {
    return [
      { address: '', op: 'kernelbase.dll · pushRetStub', group: true },
      { address: stubs.pushRet, op: 'push rbx', group: false },
      { address: stubs.pushRetRet, op: 'ret', group: false },
    ];
  }
  if (live.rip === stubs.addRsp || live.rip === stubs.addRspRet) {
    return [
      { address: '', op: 'ntdll.dll · addRsp28RetStub', group: true },
      { address: stubs.addRsp, op: 'add rsp, 28h', group: false },
      { address: stubs.addRspRet, op: 'ret', group: false },
    ];
  }
  return [
    { address: '', op: `target.exe!${target.name} · schematic`, group: true },
    ...target.code.map(({ address, op }) => ({ address, op, group: false })),
  ];
});

const codeLocation = computed(() => {
  if (nativeCode.some(([address]) => address === live.rip)) return 'target.exe';
  if (live.rip === stubs.jump) return 'ntdll.dll';
  if (live.rip === stubs.spin) return 'kernel32.dll';
  if (live.rip === stubs.pushRet || live.rip === stubs.pushRetRet)
    return 'kernelbase.dll';
  if (live.rip === stubs.addRsp || live.rip === stubs.addRspRet)
    return 'ntdll.dll';
  return `target.exe!${activeCall.value.name}`;
});

const savedState = computed(() => saved.value ?? zeroRegisters);
const savedLabel = computed(() => {
  if (saved.value) return `${text('KOPYA', 'COPY')} ${contextCopies.value}/2`;
  return text('BOŞ', 'EMPTY');
});
const contextBufferPreview = computed(() => {
  if (!contextBuffer.value) return 'ctx = {}';
  return `ctx = { ${registers
    .map((name) => `${name.toUpperCase()}: ${contextBuffer.value![name]}`)
    .join(', ')} }`;
});
const memoryRows = computed(() => [
  {
    address: '0x000001F410002018',
    value: '0x000001F410004000',
    role: '[rbx+18h]',
    access: 'R--',
  },
  {
    address: '0x000001F420001000',
    value: bufferFilled.value ? '2A 2A 2A 2A' : '00 00 00 00',
    role: text('demo buffer', 'demo buffer'),
    access: 'RW-',
  },
  {
    address: '0x000001F420002000',
    value: '78 02 3C 01',
    role: text('cursor sonucu', 'cursor result'),
    access: 'RW-',
  },
  {
    address: '0x000001F420003000',
    value: '30 00 00 00',
    role: text('sayfa bilgisi', 'page info'),
    access: 'RW-',
  },
]);

const stackRows = computed(() => [
  {
    address: callRsp,
    value: stackStageB.value ? stubs.addRsp : '0x0000000000000000',
    role: 'return #1',
  },
  {
    address: '0x000000A418F8B840',
    value: '0x0000000000000000',
    role: 'shadow +00h',
  },
  {
    address: '0x000000A418F8B848',
    value: '0x0000000000000000',
    role: 'shadow +08h',
  },
  {
    address: '0x000000A418F8B850',
    value: '0x0000000000000000',
    role: 'shadow +10h',
  },
  {
    address: '0x000000A418F8B858',
    value: '0x0000000000000000',
    role: 'shadow +18h',
  },
  {
    address: '0x000000A418F8B860',
    value: '0x0000000000000000',
    role: text('arg #5 / boş', 'arg #5 / unused'),
  },
  {
    address: '0x000000A418F8B868',
    value: stackStageA.value ? stubs.spin : '0x0000000000000000',
    role: 'return #2',
  },
]);

const enableNThread = () => {
  if (phase.value !== 'native') return;
  capturedCursor.value = nativeCursor.value;
  saved.value = null;
  initialSnapshot.value = null;
  contextCopies.value = 0;
  disableQueued.value = false;
  phase.value = 'enabling';
  transition.value = 0;
  threadState.value = 'suspending';
  contextAction.value = 'SuspendThread()';
  changedRegisters.value = [];
  instructionActive.value = false;
  addLog(text('SuspendThread() istendi', 'SuspendThread() requested'));
};

const disableNThread = () => {
  if (phase.value === 'native' || phase.value === 'disabling') return;
  disableQueued.value = true;
  addLog(
    text(
      'deinit() kuyruğa alındı; güvenli spin noktası bekleniyor',
      'deinit() queued; waiting for the safe spin point',
    ),
  );
  if (
    phase.value === 'active' &&
    live.rip === stubs.spin &&
    threadState.value === 'running'
  ) {
    phase.value = 'disabling';
    transition.value = 0;
  }
};

const tickNative = () => {
  markInstruction();
  const current = nativeCursor.value;
  let next = (current + 1) % nativeCode.length;

  if (current === 0) {
    live.rcx = '0x000001F410004000';
  } else if (current === 1) {
    zeroFlag.value = BigInt(live.rcx) === 0n;
  } else if (current === 2 && zeroFlag.value) {
    next = 0;
  } else if (current === 3) {
    live.rdx = hex64(BigInt(clock.value));
  } else if (current === 4) {
    live.rax = addHex(live.rax, 1n);
  } else if (current === 5) {
    next = 0;
  }

  nativeCursor.value = next;
  live.rip = nativeCode[next]![0];
};

const tickEnabling = () => {
  if (transition.value === 0) {
    threadState.value = 'suspended';
    const captured = getContext();
    initialSnapshot.value = copyRegisters(captured);
    saved.value = copyRegisters(captured);
    contextCopies.value = 1;
    contextAction.value = text(
      'getContext() #1 · live → savedContext',
      'getContext() #1 · live → savedContext',
    );
    transition.value = 1;
    addLog(text('İlk context kopyası alındı', 'First context copy captured'));
    return;
  }
  if (transition.value === 1) {
    const redirect = getContext();
    redirect.rbx = stubs.spin;
    redirect.rip = stubs.jump;
    setContext(redirect);
    threadState.value = 'resuming';
    contextAction.value = text(
      'setContext(redirect) uygulandı',
      'setContext(redirect) applied',
    );
    transition.value = 2;
    addLog(
      text('RIP = jumpStub; RBX = spinStub', 'RIP = jumpStub; RBX = spinStub'),
    );
    return;
  }
  if (transition.value === 2) {
    threadState.value = 'running';
    contextAction.value = 'ResumeThread()';
    transition.value = 3;
    addLog(text('Thread yeniden yürütüldü', 'Thread resumed'));
    return;
  }
  if (transition.value === 3) {
    markInstruction();
    live.rip = stubs.spin;
    transition.value = 4;
    addLog(text('jumpStub → spinStub', 'jumpStub → spinStub'));
    return;
  }
  if (transition.value === 4) {
    const spinSnapshot = getContext();
    if (initialSnapshot.value) {
      spinSnapshot.rip = initialSnapshot.value.rip;
      spinSnapshot.rbx = initialSnapshot.value.rbx;
    }
    saved.value = spinSnapshot;
    contextCopies.value = 2;
    contextAction.value = text(
      'getContext() #2 · spin kopyası + özgün RIP/RBX',
      'getContext() #2 · spin copy + original RIP/RBX',
    );
    transition.value = 5;
    addLog(
      text(
        'Spin yakalandı; ikinci kopya alındı',
        'Spin detected; second copy captured',
      ),
    );
    return;
  }
  if (transition.value === 5) {
    const stageA = getContext();
    stageA.rip = stubs.pushRet;
    stageA.rsp = '0x000000A418F8B870';
    stageA.rbx = stubs.spin;
    setContext(stageA);
    contextAction.value = 'setContext(stageA)';
    transition.value = 7;
    return;
  }
  if (transition.value === 7) {
    markInstruction();
    live.rsp = addHex(live.rsp, -8n);
    live.rip = stubs.pushRetRet;
    stackStageA.value = true;
    transition.value = 8;
    addLog(
      text('push spinStub → [callRsp+48]', 'push spinStub → [callRsp+48]'),
    );
    return;
  }
  if (transition.value === 8) {
    markInstruction();
    live.rsp = addHex(live.rsp, 8n);
    live.rip = stubs.spin;
    transition.value = 9;
    addLog(text('Stage A ret → spinStub', 'Stage A ret → spinStub'));
    return;
  }
  if (transition.value === 9) {
    getContext();
    contextAction.value = 'getContext(stageA) · RIP == spinStub';
    transition.value = 10;
    return;
  }
  if (transition.value === 10) {
    const stageB = getContext();
    stageB.rip = stubs.pushRet;
    stageB.rsp = '0x000000A418F8B840';
    stageB.rbx = stubs.addRsp;
    setContext(stageB);
    contextAction.value = 'setContext(stageB)';
    transition.value = 12;
    return;
  }
  if (transition.value === 12) {
    markInstruction();
    live.rsp = addHex(live.rsp, -8n);
    live.rip = stubs.pushRetRet;
    stackStageB.value = true;
    transition.value = 13;
    addLog(text('push cleaner → [callRsp]', 'push cleaner → [callRsp]'));
    return;
  }
  if (transition.value === 13) {
    markInstruction();
    live.rsp = addHex(live.rsp, 8n);
    live.rip = stubs.addRsp;
    transition.value = 14;
    addLog(text('ret #1 → cleaner', 'ret #1 → cleaner'));
    return;
  }
  if (transition.value === 14) {
    markInstruction();
    live.rsp = addHex(live.rsp, 0x28n);
    live.rip = stubs.addRspRet;
    transition.value = 15;
    addLog(text('add rsp, 28h', 'add rsp, 28h'));
    return;
  }
  if (transition.value === 15) {
    markInstruction();
    live.rsp = addHex(live.rsp, 8n);
    live.rip = stubs.spin;
    transition.value = 16;
    addLog(text('ret #2 → spinStub', 'ret #2 → spinStub'));
    return;
  }

  getContext();
  contextAction.value = 'getContext(stageB) · RIP == spinStub';
  transition.value = 0;
  if (disableQueued.value) {
    phase.value = 'disabling';
    disableQueued.value = false;
    addLog(
      text('Init bitti; deinit başlıyor', 'Init complete; starting deinit'),
    );
  } else {
    phase.value = 'active';
    addLog(
      text(
        'NThread hazır; thread EB FE üzerinde çalışıyor',
        'NThread ready; thread is running at EB FE',
      ),
    );
  }
};

const tickActive = () => {
  if (transition.value === 0) {
    if (disableQueued.value) {
      phase.value = 'disabling';
      disableQueued.value = false;
      return;
    }
    activeCall.value = calls[callCursor.value % calls.length] ?? calls[0];
    callCursor.value += 1;
    instructionCursor.value = 0;
    const callContext = getContext();
    callContext.rip = activeCall.value.address;
    callContext.rsp = callRsp;
    callContext.rcx = activeCall.value.rcx;
    callContext.rdx = activeCall.value.rdx;
    callContext.r8 = activeCall.value.r8;
    setContext(callContext);
    contextAction.value = 'getContext() → setContext(call)';
    addLog(text('Host çağrısı: ', 'Host call: ') + activeCall.value.name);
    transition.value = 2;
    return;
  }

  if (transition.value === 2) {
    markInstruction();
    const instruction = activeCall.value.code[instructionCursor.value];
    if (!instruction) return;
    const op = instruction.op;

    if (op.startsWith('sub rsp')) {
      const amount = op.includes('38h') ? 0x38n : 0x28n;
      live.rsp = addHex(live.rsp, -amount);
    } else if (op.startsWith('add rsp')) {
      const amount = op.includes('38h') ? 0x38n : 0x28n;
      live.rsp = addHex(live.rsp, amount);
    } else if (op === 'mov r10, rcx') {
      stringReturn.value = live.rcx;
    } else if (op === 'mov rdi, rcx') {
      stringDestination.value = live.rcx;
    } else if (op === 'mov al, dl') {
      stringByte.value = Number(BigInt(live.rdx) & 0xffn);
      live.rax = hex64((BigInt(live.rax) & ~0xffn) | BigInt(stringByte.value));
    } else if (op === 'mov rcx, r8') {
      live.rcx = live.r8;
    } else if (op === 'mov rax, rcx') {
      live.rax = live.rcx;
    } else if (op === 'mov rax, r10') {
      live.rax = stringReturn.value;
    } else if (op === 'mov eax, gs:[48h]') {
      live.rax = activeCall.value.result;
    } else if (op === 'rep stosb') {
      const count = BigInt(live.rcx);
      if (
        stringDestination.value === '0x000001F420001000' &&
        stringByte.value === 0x2a &&
        count >= 4n
      ) {
        bufferFilled.value = true;
      }
      stringDestination.value = addHex(stringDestination.value, count);
      live.rcx = '0x0000000000000000';
    } else if (op === 'syscall' || op.startsWith('call ')) {
      live.rax = activeCall.value.result;
    }

    if (op === 'ret') {
      live.rax = activeCall.value.result;
      live.rsp = addHex(live.rsp, 8n);
      live.rip = stubs.addRsp;
      transition.value = 3;
      addLog(text('Target ret → cleaner', 'Target ret → cleaner'));
      return;
    }

    instructionCursor.value += 1;
    const next = activeCall.value.code[instructionCursor.value];
    if (next) live.rip = next.address;
    return;
  }

  if (transition.value === 3) {
    markInstruction();
    live.rsp = addHex(live.rsp, 0x28n);
    live.rip = stubs.addRspRet;
    transition.value = 4;
    addLog(text('add rsp, 28h tamamlandı', 'add rsp, 28h completed'));
    return;
  }

  if (transition.value === 4) {
    markInstruction();
    live.rsp = addHex(live.rsp, 8n);
    live.rip = stubs.spin;
    transition.value = 5;
    return;
  }

  getContext();
  contextAction.value = 'getContext(result) · RIP == spinStub';
  transition.value = 0;
  addLog(
    text(
      'Sonuç okundu; thread EB FE üzerinde çalışıyor',
      'Result read; thread remains running at EB FE',
    ),
  );
  if (disableQueued.value) {
    phase.value = 'disabling';
    disableQueued.value = false;
  }
};

const tickDisabling = () => {
  if (!saved.value) return;
  if (transition.value === 0) {
    setContext(saved.value);
    contextAction.value = text(
      'setContext(savedContext) · spin → özgün RIP',
      'setContext(savedContext) · spin → original RIP',
    );
    addLog(
      text(
        'INTEGER + CONTROL + FLOATING POINT geri uygulandı',
        'INTEGER + CONTROL + FLOATING POINT restored',
      ),
    );
    transition.value = 1;
    return;
  }
  nativeCursor.value = capturedCursor.value;
  phase.value = 'native';
  threadState.value = 'running';
  contextAction.value = text('savedContext bırakıldı', 'savedContext released');
  saved.value = null;
  contextCopies.value = 0;
  initialSnapshot.value = null;
  disableQueued.value = false;
  transition.value = 0;
  addLog(
    text(
      "Thread özgün instruction'dan yürümeye devam etti",
      'Thread continued at the original instruction',
    ),
  );
};

const tick = () => {
  if (paused.value) return;
  const before = copyRegisters(live);
  instructionActive.value = false;
  clock.value += 1;
  if (phase.value === 'native') tickNative();
  else if (phase.value === 'enabling') tickEnabling();
  else if (phase.value === 'active') tickActive();
  else tickDisabling();
  changedRegisters.value = registers.filter(
    (name) => before[name] !== live[name],
  );
};

onMounted(() => {
  timer = setInterval(tick, 720);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <section class="nthread-simulator" :data-phase="phase">
    <header class="sim-header">
      <div class="sim-heading">
        <div class="sim-eyebrow">
          <span class="sim-led"></span>{{ phaseLabel }}
        </div>
        <h2>
          {{ text('Canlı NThread simülatörü', 'Live NThread simulator') }}
        </h2>
        <p>{{ statusText }}</p>
      </div>
      <div class="sim-actions">
        <div class="sim-clock" :class="{ paused }">
          <span>CPU CLOCK</span>
          <strong>{{ clockLabel }}</strong>
          <i></i>
        </div>
        <div class="sim-controls">
          <button
            class="sim-enable"
            :disabled="phase !== 'native'"
            @click="enableNThread"
          >
            {{ text('ENABLE · init()', 'ENABLE · init()') }}
          </button>
          <button
            class="sim-disable"
            :disabled="phase === 'native' || phase === 'disabling'"
            @click="disableNThread"
          >
            {{ text('DISABLE · deinit()', 'DISABLE · deinit()') }}
          </button>
          <button class="sim-pause" @click="paused = !paused">
            {{ paused ? text('Devam', 'Resume') : text('Duraklat', 'Pause') }}
          </button>
        </div>
      </div>
    </header>

    <div class="sim-runtime-strip">
      <div :data-thread-state="threadState">
        <span>OS THREAD #1A34</span>
        <strong>{{ cpuState }}</strong>
      </div>
      <div
        :class="{
          transferring:
            contextAction.includes('capture') || contextAction.includes('→'),
        }"
      >
        <span>CONTEXT BUS</span>
        <strong>{{ contextAction }}</strong>
      </div>
      <div>
        <span>savedContext</span>
        <strong>{{ contextCopies }} / 2 {{ text('KOPYA', 'COPIES') }}</strong>
      </div>
    </div>

    <div class="sim-workbench">
      <section class="sim-code-window">
        <div class="sim-window-title">
          <span></span><span></span><span></span>
          <strong>thread #1A34 · {{ codeLocation }}</strong>
        </div>
        <div :key="clock" class="sim-code">
          <div
            v-for="line in codeLines"
            :key="line.address + line.op"
            class="sim-code-line"
            :class="{
              executing:
                instructionActive &&
                !line.group &&
                line.address === executedRip,
              current: !line.group && line.address === live.rip,
              group: line.group,
            }"
          >
            <span class="sim-pointer">{{
              !line.group && line.address === live.rip ? '▶' : ''
            }}</span>
            <span class="sim-address">{{ line.address }}</span>
            <code>{{ line.op }}</code>
          </div>
        </div>
      </section>

      <aside class="sim-debugger">
        <section>
          <div class="sim-panel-title">
            <h3>Live CONTEXT</h3>
            <span :class="{ running: threadState === 'running' }">{{
              cpuState
            }}</span>
          </div>
          <dl class="sim-registers">
            <div
              v-for="name in registers"
              :key="name"
              :class="{
                hot: name === 'rip',
                changed: changedRegisters.includes(name),
              }"
            >
              <dt>{{ name.toUpperCase() }}</dt>
              <dd>{{ live[name] }}</dd>
            </div>
          </dl>
        </section>

        <section
          :class="{
            copying: contextAction.includes('getContext() #'),
            releasing:
              contextAction.includes('bırakıldı') ||
              contextAction.includes('released'),
          }"
        >
          <div class="sim-panel-title">
            <h3>savedContext</h3>
            <span>{{ savedLabel }}</span>
          </div>
          <dl class="sim-registers saved">
            <div v-for="name in registers" :key="name">
              <dt>{{ name.toUpperCase() }}</dt>
              <dd :class="{ equal: savedState[name] === live[name] }">
                {{ savedState[name] }}
              </dd>
            </div>
          </dl>
        </section>

        <section class="sim-context-api">
          <div class="sim-panel-title">
            <h3>Context I/O</h3>
            <span>AUTO TRACE · 9 FIELDS</span>
          </div>
          <div class="sim-context-methods">
            <code>getContext()</code>
            <span>↔</span>
            <code>setContext(ctx)</code>
          </div>
          <code class="sim-context-buffer">{{ contextBufferPreview }}</code>
        </section>
      </aside>
    </div>

    <div class="sim-memory-grid">
      <section>
        <div class="sim-panel-title">
          <h3>{{ text('Önceden tanımlı bellek', 'Predetermined memory') }}</h3>
          <span>FIXED MAP</span>
        </div>
        <div class="sim-memory-table">
          <div class="sim-memory-head">
            <span>ADDRESS</span><span>VALUE</span><span>USE</span
            ><span>PROT</span>
          </div>
          <div v-for="row in memoryRows" :key="row.address">
            <code>{{ row.address }}</code>
            <strong>{{ row.value }}</strong>
            <span>{{ row.role }}</span>
            <em>{{ row.access }}</em>
          </div>
        </div>
      </section>
      <section>
        <div class="sim-panel-title">
          <h3>{{ text('Sabit stack penceresi', 'Fixed stack window') }}</h3>
          <span>callRsp ± 30h</span>
        </div>
        <div class="sim-stack-table">
          <div v-for="row in stackRows" :key="row.address">
            <code>{{ row.address }}</code>
            <strong>{{ row.value }}</strong>
            <span>{{ row.role }}</span>
          </div>
        </div>
      </section>
    </div>

    <footer class="sim-footer">
      <section>
        <h3>
          {{ text('Sınırlı instruction set', 'Limited instruction set') }}
        </h3>
        <div class="sim-isa">
          <code v-for="instruction in supportedInstructions" :key="instruction">
            {{ instruction }}
          </code>
        </div>
      </section>
      <section>
        <h3>{{ text('Olay akışı', 'Event stream') }}</h3>
        <ul>
          <li v-for="(entry, index) in eventLog" :key="`${clock}-${index}`">
            {{ entry }}
          </li>
        </ul>
      </section>
    </footer>

    <p class="sim-disclaimer">
      {{
        text(
          'Bu, sabit adresler ve dokuz komut grubuyla çalışan yavaşlatılmış bir eğitim modelidir. Örnek çağrıları demo host üretir; gerçek NThread yalnız call() istendiğinde hedefe gider. Simülasyondaki NThread, getContext() ve setContext() ile yalnız ekrandaki dokuz alanı işler; gerçek implementasyon FLOATING POINT/XMM grubunu da korur.',
          'This is a slowed educational model with fixed addresses and nine instruction groups. The demo host generates sample calls; real NThread visits a target only for call(). The simulated NThread uses getContext() and setContext() only for the nine visible fields; the real implementation also preserves the FLOATING POINT/XMM group.',
        )
      }}
    </p>
  </section>
</template>
