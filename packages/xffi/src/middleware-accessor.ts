import { type AddressLike, NativeMemory } from './pointer.js';
import { AbstractSyncMemoryAccessor } from './accessor.js';
import * as debug from './debug-helper.js';
import { type ISyncCallableMemoryAccessor } from './iaccessor.js';
import { type CFunction } from './cfunction.js';
import { type CMachineCode } from './cmachinecode.js';
import { type CCallResult } from './types.js';
import { type Pattern } from './win/scanner.js';

/**
 * Minimal surface `MiddlewareAccessor`/`InittableMiddlewareAccessor` (and
 * `DebugMemoryAccessor`) need from a `root` accessor. The concrete
 * `HostAccessor` class (and its whole family -- `RedirectorHostAccessor`,
 * `BootstrapHostAccessor`, etc.) lives in `exoproc-accessors`, a package that
 * depends on `bun-xffi`; typing `root` as the concrete class here would make
 * `bun-xffi` depend back on `exoproc-accessors`, a cycle. `HostAccessor`
 * structurally satisfies this interface already (it extends
 * `InittableMiddlewareAccessor`, which provides every `ISyncCallableMemoryAccessor`
 * method), so nothing downstream needs to change to conform to it.
 */
export interface IHostAccessor extends ISyncCallableMemoryAccessor {
  close(): void;
}

/**
 * Structural counterpart to `MiddlewareAccessor`, used instead of
 * `instanceof MiddlewareAccessor` for chain-walking (`initNext`, the
 * `backend`-chain pid lookup, etc.). `instanceof` compares against a
 * *specific loaded copy* of the `MiddlewareAccessor` class -- when a chain
 * crosses a package boundary (e.g. `nthread`'s `NThread` and `accessors`'s
 * `MemsetWriteAccessor` each resolve their own `bun-xffi` via their own
 * `node_modules` symlink), Bun-under-Wine has been observed to load two
 * separate copies of `bun-xffi` even though both symlinks resolve to the
 * same canonical directory -- so an instance built from one copy silently
 * fails `instanceof` against the other copy's class, despite being
 * structurally identical. Checking for the shape instead of the class
 * reference sidesteps the whole problem.
 */
export interface IMiddlewareAccessor extends ISyncCallableMemoryAccessor {
  backend: ISyncCallableMemoryAccessor;
  readonly root: IHostAccessor;
}

export function isMiddlewareAccessor(obj: unknown): obj is IMiddlewareAccessor {
  return (
    !!obj &&
    typeof obj === 'object' &&
    'backend' in obj &&
    'root' in obj &&
    typeof (obj as { call?: unknown }).call === 'function' &&
    typeof (obj as { read?: unknown }).read === 'function'
  );
}

/** Structural counterpart to `InittableMiddlewareAccessor` -- see {@link IMiddlewareAccessor} for why this exists instead of `instanceof`. */
export interface IInittableAccessor extends IMiddlewareAccessor {
  readonly isInitializing: boolean;
  readonly isInitializingSync: boolean;
  init(): Promise<void>;
  initSync(): void;
  deinit(): Promise<void>;
  deinitSync(): void;
}

export function isInittableAccessor(obj: unknown): obj is IInittableAccessor {
  return (
    isMiddlewareAccessor(obj) &&
    typeof (obj as { init?: unknown }).init === 'function' &&
    typeof (obj as { initSync?: unknown }).initSync === 'function' &&
    typeof (obj as { deinit?: unknown }).deinit === 'function' &&
    typeof (obj as { deinitSync?: unknown }).deinitSync === 'function'
  );
}

/**
 * Thrown when `init()` and `initSync()` are attempted concurrently on the same
 * accessor. A sync caller cannot `await` an in-flight async init -- there is
 * no way to block the JS thread on a Promise without an event-loop tick -- so
 * rather than silently letting both paths race (each running `initNext()`/
 * `onInit()` independently, double-executing side effects like suspending a
 * hijacked thread twice), whichever call notices the other is in progress
 * throws immediately instead.
 */
export class ConcurrentInitError extends Error {
  constructor(kind: 'sync-during-async' | 'async-during-sync') {
    super(
      kind === 'sync-during-async'
        ? 'initSync() called while an async init() is already in progress on this accessor -- await the async init first, or use only the sync API on this accessor.'
        : 'init() called while a sync initSync() is already in progress on this accessor -- this should be structurally unreachable (initSync() never yields), so seeing it means onInitSync() (or something it calls) itself triggered an async init().',
    );
    this.name = 'ConcurrentInitError';
  }
}

export class MiddlewareAccessor extends AbstractSyncMemoryAccessor {
  public backend: ISyncCallableMemoryAccessor;
  public readonly root: IHostAccessor;

  override get processId(): number {
    if ((this.root as any) === this) {
      return this._processId;
    }
    return this.root.processId;
  }

  constructor(backend: ISyncCallableMemoryAccessor, root: IHostAccessor) {
    let b: ISyncCallableMemoryAccessor = backend;
    while (isMiddlewareAccessor(b)) {
      b = b.backend;
    }
    const pid = b ? b.processId : backend.processId;
    super(pid);
    this.backend = backend;
    this.root = root;
  }

  override enableDebug(): void {
    if (!(this.backend instanceof DebugMemoryAccessor)) {
      this.backend = new DebugMemoryAccessor(this.backend, this.root);
    }
  }

  override disableDebug(): void {
    if (this.backend instanceof DebugMemoryAccessor) {
      this.backend = this.backend.backend;
    }
  }

  override async read(
    address: AddressLike,
    size: number,
    offset = 0,
  ): Promise<Buffer> {
    return this.backend.read(address, size, offset);
  }

  override async write(
    address: AddressLike,
    data: Buffer | Uint8Array,
    offset = 0,
  ): Promise<number> {
    return this.backend.write(address, data, offset);
  }

  override async alloc(
    size: number | any,
    address: AddressLike | null = null,
    protection?: any,
    allocationType?: any,
  ): Promise<AddressLike> {
    return this.backend.alloc(size, address, protection, allocationType);
  }

  override async free(
    address: AddressLike,
    size = 0,
    freeType?: any,
  ): Promise<boolean> {
    return this.backend.free(address, size, freeType);
  }

  override async protect(
    address: AddressLike,
    size: number,
    newProtect: any,
  ): Promise<number> {
    return this.backend.protect(address, size, newProtect);
  }

  override async query(address: AddressLike): Promise<any> {
    return this.backend.query(address);
  }

  override async machineCode(machineCode: CMachineCode): Promise<number> {
    return this.backend.machineCode(machineCode);
  }

  override machineCodeSync(machineCode: CMachineCode): number {
    return this.backend.machineCodeSync(machineCode);
  }

  override async *scan(
    address: AddressLike,
    size: number,
    pattern: Pattern | string,
  ): AsyncGenerator<NativeMemory> {
    yield* this.backend.scan(address, size, pattern);
  }

  *scanSync(
    address: AddressLike,
    size: number,
    pattern: Pattern | string,
  ): Generator<NativeMemory> {
    yield* this.backend.scanSync(address, size, pattern);
  }

  readSync(address: AddressLike, size: number, offset = 0): Buffer {
    return this.backend.readSync(address, size, offset);
  }

  writeSync(
    address: AddressLike,
    data: Buffer | Uint8Array,
    offset = 0,
  ): number {
    return this.backend.writeSync(address, data, offset);
  }

  allocSync(
    size: number | any,
    address: AddressLike | null = null,
    protection?: any,
    allocationType?: any,
  ): AddressLike {
    return this.backend.allocSync(size, address, protection, allocationType);
  }

  freeSync(address: AddressLike, size = 0, freeType?: any): boolean {
    return this.backend.freeSync(address, size, freeType);
  }

  protectSync(address: AddressLike, size: number, newProtect: any): any {
    return this.backend.protectSync(address, size, newProtect);
  }

  querySync(address: AddressLike): any {
    return this.backend.querySync(address);
  }

  callSync(func: CFunction, ...args: any[]): CCallResult {
    return this.backend.callSync(func, ...args);
  }

  // Forward close if backend exposes it
  close(): void {
    if (typeof (this.backend as any).close === 'function') {
      (this.backend as any).close();
    }
  }

  // Execution delegation: forward call to backend
  async call(func: CFunction, ...args: any[]): Promise<CCallResult> {
    if (
      typeof (func as any).shouldCloneForAccessor === 'function' &&
      (func as any).shouldCloneForAccessor(this)
    ) {
      const addr = await this.machineCode(func as any);
      func = (func as any).cloneForAddress(addr);
    }
    return this.backend.call(func, ...args);
  }
}

/**
 * `isInitialized`/`isInitializing`(async)/`isInitializingSync` are mutually
 * exclusive by construction (entering one while another is active throws --
 * see `ConcurrentInitError`), so instead of three independently-mutable
 * fields that could in principle drift out of sync with each other, they're
 * all views onto one tagged-union state. `async` carries the in-flight
 * promise itself (needed so concurrent async callers coalesce onto the same
 * promise instead of racing); `idle`/`sync`/`done` carry no per-instance data
 * so they're shared singletons, not allocated per instance.
 */
type InitState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'async'; readonly promise: Promise<void> }
  | { readonly kind: 'sync' }
  | { readonly kind: 'done' };

const INIT_STATE_IDLE: InitState = { kind: 'idle' };
const INIT_STATE_SYNC: InitState = { kind: 'sync' };
const INIT_STATE_DONE: InitState = { kind: 'done' };

export abstract class InittableMiddlewareAccessor extends MiddlewareAccessor {
  private initState: InitState = INIT_STATE_IDLE;

  protected get isInitialized(): boolean {
    return this.initState.kind === 'done';
  }

  protected get isInitializing(): boolean {
    return this.initState.kind === 'async';
  }

  /** Sync twin of {@link isInitializing} -- there's nothing to await synchronously, so this is a plain reentrancy flag instead of a shared in-flight promise. */
  protected get isInitializingSync(): boolean {
    return this.initState.kind === 'sync';
  }

  protected abstract onInit(): Promise<void>;

  /** Sync twin of {@link onInit}. Every subclass that implements `onInit` must implement this too -- see each's own comment for how its logic maps to *Sync calls. */
  protected abstract onInitSync(): void;

  protected async onDeinit(): Promise<void> {}

  protected onDeinitSync(): void {}

  protected async initNext(): Promise<void> {
    let next: ISyncCallableMemoryAccessor = this.backend;
    while (isMiddlewareAccessor(next) && !isInittableAccessor(next)) {
      next = next.backend;
    }
    if (isInittableAccessor(next) && !next.isInitializing) {
      await next.init();
    }
  }

  protected initNextSync(): void {
    let next: ISyncCallableMemoryAccessor = this.backend;
    while (isMiddlewareAccessor(next) && !isInittableAccessor(next)) {
      next = next.backend;
    }
    if (isInittableAccessor(next) && !next.isInitializingSync) {
      next.initSync();
    }
  }

  protected async deinitNext(): Promise<void> {
    let next: ISyncCallableMemoryAccessor = this.backend;
    while (isMiddlewareAccessor(next) && !isInittableAccessor(next)) {
      next = next.backend;
    }
    if (isInittableAccessor(next)) {
      await next.deinit();
    } else {
      super.close();
    }
  }

  protected deinitNextSync(): void {
    let next: ISyncCallableMemoryAccessor = this.backend;
    while (isMiddlewareAccessor(next) && !isInittableAccessor(next)) {
      next = next.backend;
    }
    if (isInittableAccessor(next)) {
      next.deinitSync();
    } else {
      super.close();
    }
  }

  public async deinit(): Promise<void> {
    if (!this.isInitialized) return;
    try {
      await this.onDeinit();
    } finally {
      this.initState = INIT_STATE_IDLE;
      await this.deinitNext();
    }
  }

  /** Sync twin of {@link deinit}. */
  public deinitSync(): void {
    if (!this.isInitialized) return;
    try {
      this.onDeinitSync();
    } finally {
      this.initState = INIT_STATE_IDLE;
      this.deinitNextSync();
    }
  }

  public override close(): void {
    this.deinit().catch(() => {});
  }

  public async init(): Promise<void> {
    if (this.initState.kind === 'done') return;
    if (this.initState.kind === 'async') return this.initState.promise;
    if (this.initState.kind === 'sync') {
      throw new ConcurrentInitError('async-during-sync');
    }

    let resolvePromise!: () => void;
    let rejectPromise!: (err: any) => void;
    const promise = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    promise.catch(() => {});
    this.initState = { kind: 'async', promise };

    try {
      await this.initNext();

      await this.onInit();
      this.initState = INIT_STATE_DONE;
      resolvePromise();
    } catch (err) {
      this.initState = INIT_STATE_IDLE;
      rejectPromise(err);
      throw err;
    }
  }

  /**
   * Sync twin of {@link init}. Whichever family (sync or async) a caller
   * happens to use first is the one that actually initializes the chain --
   * `readSync()`/`callSync()`/etc. call this the same way `read()`/`call()`
   * call `init()`, so neither family depends on the other having run first.
   * The `sync` state guards against reentrancy (e.g. `onInitSync()` itself
   * issuing a `this.root.*Sync()` call that would otherwise re-trigger
   * `initSync()` on the same instance). A sync caller can't `await` an
   * in-flight async promise, so if one is already running this throws
   * instead of racing it -- see {@link ConcurrentInitError}.
   */
  public initSync(): void {
    if (this.initState.kind === 'done') return;
    if (this.initState.kind === 'sync') return;
    if (this.initState.kind === 'async') {
      throw new ConcurrentInitError('sync-during-async');
    }

    this.initState = INIT_STATE_SYNC;
    try {
      this.initNextSync();
      this.onInitSync();
      this.initState = INIT_STATE_DONE;
    } catch (err) {
      this.initState = INIT_STATE_IDLE;
      throw err;
    }
  }

  override async read(
    address: AddressLike,
    size: number,
    offset = 0,
  ): Promise<Buffer> {
    if (!this.isInitializing) {
      await this.init();
    }
    return this.readAfterInit(address, size, offset);
  }

  override async write(
    address: AddressLike,
    data: Buffer | Uint8Array,
    offset = 0,
  ): Promise<number> {
    if (!this.isInitializing) {
      await this.init();
    }
    return this.writeAfterInit(address, data, offset);
  }

  override async alloc(
    size: number | any,
    address: AddressLike | null = null,
    protection?: any,
    allocationType?: any,
  ): Promise<AddressLike> {
    if (!this.isInitializing) {
      await this.init();
    }
    return this.allocAfterInit(size, address, protection, allocationType);
  }

  override async free(
    address: AddressLike,
    size = 0,
    freeType?: any,
  ): Promise<boolean> {
    if (!this.isInitializing) {
      await this.init();
    }
    return this.freeAfterInit(address, size, freeType);
  }

  override async protect(
    address: AddressLike,
    size: number,
    newProtect: any,
  ): Promise<number> {
    if (!this.isInitializing) {
      await this.init();
    }
    return this.protectAfterInit(address, size, newProtect);
  }

  override async query(address: AddressLike): Promise<any> {
    if (!this.isInitializing) {
      await this.init();
    }
    return this.queryAfterInit(address);
  }

  override async call(func: CFunction, ...args: any[]): Promise<CCallResult> {
    if (!this.isInitializing) {
      await this.init();
    }
    return this.callAfterInit(func, args);
  }

  override async machineCode(machineCode: CMachineCode): Promise<number> {
    // Like every other op above, machineCode() must trigger a clean up-front
    // init. Without this guard it fell through to the unguarded
    // MiddlewareAccessor.machineCode and forwarded down the chain *before* the
    // chain was initialized -- so if machineCode() was the very first call, the
    // backend (e.g. NThread) wasn't redirected yet and the msvcrt-load check in
    // MsvcrtDependentMiddlewareAccessor.onInit ran against a broken call and
    // spuriously reported msvcrt as not loaded.
    if (!this.isInitializing) {
      await this.init();
    }
    return this.machineCodeAfterInit(machineCode);
  }

  // ── Sync twins of the dispatch overrides above. Same init guard shape as
  //    their async counterparts, just via initSync()/isInitializingSync
  //    instead of init()/isInitializing -- whichever family (sync or async)
  //    a caller uses first is the one that actually initializes the chain,
  //    so neither depends on the other having run first. ───────────────────

  override readSync(address: AddressLike, size: number, offset = 0): Buffer {
    if (!this.isInitializingSync) {
      this.initSync();
    }
    return this.readAfterInitSync(address, size, offset);
  }

  override writeSync(
    address: AddressLike,
    data: Buffer | Uint8Array,
    offset = 0,
  ): number {
    if (!this.isInitializingSync) {
      this.initSync();
    }
    return this.writeAfterInitSync(address, data, offset);
  }

  override allocSync(
    size: number | any,
    address: AddressLike | null = null,
    protection?: any,
    allocationType?: any,
  ): AddressLike {
    if (!this.isInitializingSync) {
      this.initSync();
    }
    return this.allocAfterInitSync(size, address, protection, allocationType);
  }

  override freeSync(address: AddressLike, size = 0, freeType?: any): boolean {
    if (!this.isInitializingSync) {
      this.initSync();
    }
    return this.freeAfterInitSync(address, size, freeType);
  }

  override protectSync(
    address: AddressLike,
    size: number,
    newProtect: any,
  ): number {
    if (!this.isInitializingSync) {
      this.initSync();
    }
    return this.protectAfterInitSync(address, size, newProtect);
  }

  override querySync(address: AddressLike): any {
    if (!this.isInitializingSync) {
      this.initSync();
    }
    return this.queryAfterInitSync(address);
  }

  override callSync(func: CFunction, ...args: any[]): CCallResult {
    if (!this.isInitializingSync) {
      this.initSync();
    }
    return this.callAfterInitSync(func, args);
  }

  override machineCodeSync(machineCode: CMachineCode): number {
    if (!this.isInitializingSync) {
      this.initSync();
    }
    return this.machineCodeAfterInitSync(machineCode);
  }

  protected async readAfterInit(
    address: AddressLike,
    size: number,
    offset = 0,
  ): Promise<Buffer> {
    return super.read(address, size, offset);
  }

  protected readAfterInitSync(
    address: AddressLike,
    size: number,
    offset = 0,
  ): Buffer {
    return super.readSync(address, size, offset);
  }

  protected async writeAfterInit(
    address: AddressLike,
    data: Buffer | Uint8Array,
    offset = 0,
  ): Promise<number> {
    return super.write(address, data, offset);
  }

  protected writeAfterInitSync(
    address: AddressLike,
    data: Buffer | Uint8Array,
    offset = 0,
  ): number {
    return super.writeSync(address, data, offset);
  }

  protected async allocAfterInit(
    size: number | any,
    address: AddressLike | null = null,
    protection?: any,
    allocationType?: any,
  ): Promise<AddressLike> {
    return super.alloc(size, address, protection, allocationType);
  }

  protected allocAfterInitSync(
    size: number | any,
    address: AddressLike | null = null,
    protection?: any,
    allocationType?: any,
  ): AddressLike {
    return super.allocSync(size, address, protection, allocationType);
  }

  protected async freeAfterInit(
    address: AddressLike,
    size = 0,
    freeType?: any,
  ): Promise<boolean> {
    return super.free(address, size, freeType);
  }

  protected freeAfterInitSync(
    address: AddressLike,
    size = 0,
    freeType?: any,
  ): boolean {
    return super.freeSync(address, size, freeType);
  }

  protected async protectAfterInit(
    address: AddressLike,
    size: number,
    newProtect: any,
  ): Promise<number> {
    return super.protect(address, size, newProtect);
  }

  protected protectAfterInitSync(
    address: AddressLike,
    size: number,
    newProtect: any,
  ): number {
    return super.protectSync(address, size, newProtect);
  }

  protected async queryAfterInit(address: AddressLike): Promise<any> {
    return super.query(address);
  }

  protected queryAfterInitSync(address: AddressLike): any {
    return super.querySync(address);
  }

  protected async callAfterInit(
    func: CFunction,
    args: any[],
  ): Promise<CCallResult> {
    return super.call(func, ...args);
  }

  protected callAfterInitSync(func: CFunction, args: any[]): CCallResult {
    return super.callSync(func, ...args);
  }

  protected async machineCodeAfterInit(
    machineCode: CMachineCode,
  ): Promise<number> {
    return super.machineCode(machineCode);
  }

  protected machineCodeAfterInitSync(machineCode: CMachineCode): number {
    return super.machineCodeSync(machineCode);
  }
}

/**
 * Base middleware accessor for components that require msvcrt.dll in the target process.
 */
export class DebugMemoryAccessor extends MiddlewareAccessor {
  constructor(backend: ISyncCallableMemoryAccessor, root: IHostAccessor) {
    super(backend, root);
    if (backend) {
      let curr: any = backend;
      while (curr) {
        if (
          typeof curr.enableDebug === 'function' &&
          curr !== this &&
          !(curr instanceof DebugMemoryAccessor)
        ) {
          try {
            if (
              Object.prototype.hasOwnProperty.call(curr, 'enableDebug') ||
              !curr.constructor.prototype.enableDebug
            ) {
              curr.enableDebug();
            }
          } catch {
            /* ignore enableDebug errors */
          }
        }
        if ('debug' in curr) {
          try {
            curr.debug = true;
          } catch {
            /* ignore debug assignment errors */
          }
        }
        curr = curr.backend;
      }
    }
  }

  override async read(address: any, size: number, offset = 0): Promise<Buffer> {
    return debug.debugRead(
      this.backend.constructor.name,
      address,
      size,
      offset,
      () => this.backend.read(address, size, offset),
    );
  }

  override readSync(address: any, size: number, offset = 0): Buffer {
    return debug.debugReadSync(
      this.backend.constructor.name,
      address,
      size,
      offset,
      () => this.backend.readSync(address, size, offset),
    );
  }

  override async write(
    address: any,
    data: Buffer | Uint8Array,
    offset = 0,
  ): Promise<number> {
    return debug.debugWrite(
      this.backend.constructor.name,
      address,
      data,
      offset,
      () => this.backend.write(address, data, offset),
    );
  }

  override writeSync(
    address: any,
    data: Buffer | Uint8Array,
    offset = 0,
  ): number {
    return debug.debugWriteSync(
      this.backend.constructor.name,
      address,
      data,
      offset,
      () => this.backend.writeSync(address, data, offset),
    );
  }

  override async alloc(
    size: number,
    address: any = null,
    protection?: any,
    allocationType?: any,
  ): Promise<any> {
    return debug.debugAlloc(
      this.backend.constructor.name,
      size,
      address,
      protection,
      allocationType,
      () => this.backend.alloc(size, address, protection, allocationType),
    );
  }

  override allocSync(
    size: number,
    address: any = null,
    protection?: any,
    allocationType?: any,
  ): any {
    return debug.debugAllocSync(
      this.backend.constructor.name,
      size,
      address,
      protection,
      allocationType,
      () => this.backend.allocSync(size, address, protection, allocationType),
    );
  }

  override async free(
    address: any,
    size = 0,
    freeType?: any,
  ): Promise<boolean> {
    return debug.debugFree(
      this.backend.constructor.name,
      address,
      size,
      freeType,
      () => this.backend.free(address, size, freeType),
    );
  }

  override freeSync(address: any, size = 0, freeType?: any): boolean {
    return debug.debugFreeSync(
      this.backend.constructor.name,
      address,
      size,
      freeType,
      () => this.backend.freeSync(address, size, freeType),
    );
  }

  override async call(func: any, ...args: any[]): Promise<any> {
    return debug.debugCall(this.backend.constructor.name, func, args, () =>
      this.backend.call(func, ...args),
    );
  }

  override callSync(func: any, ...args: any[]): any {
    return debug.debugCallSync(this.backend.constructor.name, func, args, () =>
      this.backend.callSync(func, ...args),
    );
  }

  override async protect(
    address: any,
    size: number,
    newProtect: any,
  ): Promise<any> {
    return debug.debugProtect(
      this.backend.constructor.name,
      address,
      size,
      newProtect,
      () => this.backend.protect(address, size, newProtect),
    );
  }

  override protectSync(address: any, size: number, newProtect: any): any {
    return debug.debugProtectSync(
      this.backend.constructor.name,
      address,
      size,
      newProtect,
      () => this.backend.protectSync(address, size, newProtect),
    );
  }

  override async query(address: any): Promise<any> {
    return debug.debugQuery(this.backend.constructor.name, address, () =>
      this.backend.query(address),
    );
  }

  override querySync(address: any): any {
    return debug.debugQuerySync(this.backend.constructor.name, address, () =>
      this.backend.querySync(address),
    );
  }

  override async machineCode(machineCode: CMachineCode): Promise<number> {
    return debug.debugMachineCode(
      this.backend.constructor.name,
      machineCode.size,
      () => this.backend.machineCode(machineCode),
    );
  }

  override machineCodeSync(machineCode: CMachineCode): number {
    return debug.debugMachineCodeSync(
      this.backend.constructor.name,
      machineCode.size,
      () => this.backend.machineCodeSync(machineCode),
    );
  }

  override async *scan(
    address: any,
    size: number,
    pattern: any,
  ): AsyncGenerator<NativeMemory> {
    yield* debug.debugScan(
      this.backend.constructor.name,
      address,
      size,
      pattern,
      () => this.backend.scan(address, size, pattern),
    );
  }

  override *scanSync(
    address: any,
    size: number,
    pattern: any,
  ): Generator<NativeMemory> {
    yield* debug.debugScanSync(
      this.backend.constructor.name,
      address,
      size,
      pattern,
      () => this.backend.scanSync(address, size, pattern),
    );
  }
}
