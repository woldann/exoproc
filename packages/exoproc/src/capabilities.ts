let _hasXffi: boolean | null = null;
let _hasNJava: boolean | null = null;

/**
 * Checks if low-level Windows native FFI (bun-xffi / bun-winapi) can be loaded.
 * Returns true only on Windows x64 under Bun with native FFI support.
 */
export function hasNativeXffi(): boolean {
  if (_hasXffi !== null) return _hasXffi;
  if (
    process.platform !== 'win32' ||
    typeof (globalThis as any).Bun === 'undefined'
  ) {
    _hasXffi = false;
    return false;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@woldann/bun-xffi');
    _hasXffi = true;
  } catch {
    _hasXffi = false;
  }
  return _hasXffi;
}

/**
 * Checks if native JNI reflection (bun-njava) can be loaded.
 */
export function hasNativeNJava(): boolean {
  if (_hasNJava !== null) return _hasNJava;
  if (!hasNativeXffi()) {
    _hasNJava = false;
    return false;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@woldann/bun-njava');
    _hasNJava = true;
  } catch {
    _hasNJava = false;
  }
  return _hasNJava;
}

/**
 * Ensures native XFFI / direct memory capability is available.
 * Throws a descriptive, user-friendly error if unavailable.
 */
export function assertNativeCapability(
  featureName: string = 'Native operation',
): void {
  if (!hasNativeXffi()) {
    throw new Error(
      `${featureName} is disabled: native Windows FFI (bun-xffi) is not available in this environment. ` +
        `Direct memory and daemon features require Windows x64 with Bun. ` +
        `Please use Exoproc client/tool commands to connect to an active daemon or in-process Java agent.`,
    );
  }
}

export type RuntimeMode = 'native' | 'tool';

let _mode: RuntimeMode | null = null;

/**
 * Returns current runtime mode:
 * - 'native': Windows x64 environment with low-level FFI (bun-xffi) loaded.
 * - 'tool': Lightweight client/tool mode (Linux, Node.js, or remote client).
 */
export function getRuntimeMode(): RuntimeMode {
  if (_mode !== null) return _mode;
  if (process.env.EXOPROC_MODE === 'tool' || process.env.EXOPROC_REMOTE) {
    _mode = 'tool';
    return _mode;
  }
  _mode = hasNativeXffi() ? 'native' : 'tool';
  return _mode;
}

export function isToolMode(): boolean {
  return getRuntimeMode() === 'tool';
}

export function isNativeMode(): boolean {
  return getRuntimeMode() === 'native';
}
