import { NtdllDll } from '@woldann/win32-abi';
import type { Win32GuestDllSource } from './types.js';

export const NtdllGuestDll = {
  source: NtdllDll,
} as const satisfies Win32GuestDllSource;
