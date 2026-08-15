'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  FirstScanCompare,
  NextScanCompare,
  ScanReportDto,
  ScanStringEncoding,
  ScanValue,
  ScanValueType,
} from '../../shell/common/channels';
import { getExoprocApi } from '../../shell/renderer/bootstrap';
import { describeError, parseIntegerInput } from './format';
import type { DebugSession } from './useDebugSession';

/**
 * How many hits the result table materializes at once. The scanner always
 * narrows over its *full* candidate set -- this only caps how many rows the
 * DOM has to carry, and the panel shows the real `total` next to it so a
 * 120k-hit first scan never looks like a 256-hit one.
 */
export const SCAN_PAGE_SIZE = 256;

/** Value types that can carry an "unknown initial value" first scan. */
const FIXED_WIDTH_TYPES: readonly ScanValueType[] = [
  'i8',
  'i16',
  'i32',
  'i64',
  'f32',
  'f64',
];

export const isFixedWidthType = (type: ScanValueType) =>
  FIXED_WIDTH_TYPES.includes(type);

const FIXED_VALUE_SIZE: Readonly<Record<string, number>> = {
  i8: 1,
  i16: 2,
  i32: 4,
  i64: 8,
  f32: 4,
  f64: 8,
};

/** Next-scan compares that need a value typed into the box. */
const VALUED_COMPARES: readonly NextScanCompare[] = [
  'exact',
  'bigger-than',
  'smaller-than',
];

export const nextScanNeedsValue = (compare: NextScanCompare) =>
  VALUED_COMPARES.includes(compare);

const EMPTY_WATCH_VALUES = new Map<
  number,
  { value?: ScanValue; error?: string }
>();
const EMPTY_FROZEN = new Set<string>();

type ParseOutcome =
  { ok: true; value: ScanValue } | { ok: false; error: string };

/**
 * Turns the value box into the typed input the scanner expects. Every failure
 * path returns a message instead of a fallback value -- scanning for a number
 * the user never typed is worse than not scanning at all.
 */
export function parseScanValue(type: ScanValueType, raw: string): ParseOutcome {
  if (type === 'string') {
    if (!raw) return { ok: false, error: 'Aranacak metni girin.' };
    return { ok: true, value: raw };
  }

  const text = raw.trim();
  if (!text) return { ok: false, error: 'Aranacak değeri girin.' };

  if (type === 'bytes') {
    const digits = text.replace(/0[xX]/g, '').replace(/[\s,_]+/g, '');
    if (!/^[0-9a-fA-F]+$/.test(digits) || digits.length % 2 !== 0) {
      return {
        ok: false,
        error: `"${text}" geçerli bir byte dizisi değil (örn. 48 89 5C veya 48895C).`,
      };
    }
    const bytes = new Uint8Array(digits.length / 2);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(
        digits.slice(index * 2, index * 2 + 2),
        16,
      );
    }
    return { ok: true, value: bytes };
  }

  if (type === 'f32' || type === 'f64') {
    const numeric = Number(text.replace(',', '.'));
    if (!Number.isFinite(numeric)) {
      return {
        ok: false,
        error: `"${text}" geçerli bir ondalıklı sayı değil.`,
      };
    }
    return { ok: true, value: numeric };
  }

  const integer = parseIntegerInput(text);
  if (integer === undefined) {
    return {
      ok: false,
      error: `"${text}" geçerli bir tam sayı değil (0x… / 1F4h / ondalık bekleniyor).`,
    };
  }
  return { ok: true, value: integer };
}

/** Display form for a decoded scan value. */
export function formatScanValue(value: ScanValue): string {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return `${value}`;
    // f32 round-trips with long tails (0.1 -> 0.10000000149...); keep it
    // readable without rounding away a difference the user is scanning for.
    return value.toPrecision(9).replace(/0+$/, '').replace(/\.$/, '');
  }
  if (typeof value === 'string') return value;
  return Array.from(value, (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

/**
 * One pinned address. `size` is captured when the row is added, so a `bytes`
 * or `string` entry keeps reading the same width even after the scanner moves
 * on to another value type.
 */
export interface ScanWatchEntry {
  readonly id: number;
  readonly address: bigint;
  readonly type: ScanValueType;
  readonly encoding: ScanStringEncoding;
  readonly size: number;
}

export interface UseScannerSessionOptions {
  pid: number;
  session: DebugSession;
}

/**
 * Cheat-Engine-style scan cycle over one process, driven through
 * `window.exoproc.scan` (worker-side `Win64MemoryScanner` + freeze
 * registry) instead of a live scanner instance.
 *
 * The original hook re-read the result page and every watch row on *every
 * render*, straight off live memory, so a debugger step showed up
 * immediately. A synchronous read is no longer possible across the IPC
 * boundary, so this version instead re-fetches into local state whenever
 * `session.revision` changes (the same signal the debug session bumps on
 * every step/run/breakpoint edit) or the watch list itself changes --
 * close to the same guarantee ("shows up on the next render after a step"
 * rather than "shows up mid-render"), without turning every row render
 * into its own round trip.
 *
 * No manual `useCallback`/`useMemo` -- see the docblock on `useDebugSession`
 * for why: React Compiler already memoizes every closure/value here, and a
 * hand-written dependency array only risks disagreeing with it.
 */
export function useScannerSession({ pid, session }: UseScannerSessionOptions) {
  const api = getExoprocApi();

  const [valueType, setValueType] = useState<ScanValueType>('i32');
  const [encoding, setEncoding] = useState<ScanStringEncoding>('ascii');
  const [valueText, setValueText] = useState('');
  const [firstCompare, setFirstCompare] = useState<FirstScanCompare>('exact');
  const [nextCompare, setNextCompare] = useState<NextScanCompare>('exact');
  const [mappingId, setMappingId] = useState('');
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string>();
  const [watch, setWatch] = useState<ScanWatchEntry[]>([]);
  const [fetchedReport, setFetchedReport] = useState<ScanReportDto>();
  const [reportError, setReportError] = useState<string>();
  const [watchValues, setWatchValues] = useState<
    Map<number, { value?: ScanValue; error?: string }>
  >(new Map());
  const [frozen, setFrozen] = useState<Set<string>>(new Set());
  const [frozenCount, setFrozenCount] = useState(0);
  const watchIdRef = useRef(0);

  /* ---------- attach switch ---------- */
  const [attachedPid, setAttachedPid] = useState(pid);
  if (attachedPid !== pid) {
    setAttachedPid(pid);
    setScanned(false);
    setWatch([]);
    setFetchedReport(undefined);
    setError(undefined);
    setFrozen(new Set());
    setFrozenCount(0);
    // A stale worker-side scanner from a previous attach must not leak
    // narrowed candidates into this one.
    void api.scan.reset(pid);
  }

  const report = scanned ? fetchedReport : undefined;

  /* ---------- result page ---------- */
  useEffect(() => {
    if (!scanned) return;
    let cancelled = false;
    api.scan
      .page(pid, 0, SCAN_PAGE_SIZE)
      .then((next) => {
        if (cancelled) return;
        setFetchedReport(next);
        setReportError(undefined);
      })
      .catch((cause) => {
        if (cancelled) return;
        setReportError(describeError(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [api, pid, scanned, session.revision]);

  /**
   * Pure fetch, no `setState` -- every caller (the effect below, and
   * `editWatch`/`toggleFreeze` after a write) applies the result itself,
   * so this can be awaited from inside another async action without
   * tripping the "no setState in an effect" rule when the effect calls it.
   */
  const refreshWatch = async () => {
    const [values, frozenAddresses, count] = await Promise.all([
      Promise.all(
        watch.map(
          async (
            entry,
          ): Promise<
            readonly [number, { value?: ScanValue; error?: string }]
          > => {
            try {
              const value = await api.scan.readTypedValue(
                pid,
                entry.address,
                entry.size,
                entry.type,
                entry.encoding,
              );
              return [entry.id, { value }];
            } catch (cause) {
              return [entry.id, { error: describeError(cause) }];
            }
          },
        ),
      ),
      Promise.all(
        watch.map(
          async (entry) =>
            [
              entry.address.toString(),
              await api.scan.isFrozen(pid, entry.address),
            ] as const,
        ),
      ),
      api.scan.frozenCount(pid),
    ]);
    return {
      values: new Map(values),
      frozen: new Set(
        frozenAddresses.filter(([, isFrozen]) => isFrozen).map(([key]) => key),
      ),
      count,
    };
  };

  useEffect(() => {
    if (watch.length === 0) return;
    let cancelled = false;
    refreshWatch().then((result) => {
      if (cancelled) return;
      setWatchValues(result.values);
      setFrozen(result.frozen);
      setFrozenCount(result.count);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, pid, watch, session.revision]);

  useEffect(() => {
    void api.scan.frozenCount(pid).then(setFrozenCount);
  }, [api, pid, watch, session.revision]);

  // An empty watch list has nothing to read/freeze -- exposed as empty
  // directly rather than via a `setState` round trip through the effect
  // above, which only ever runs for a non-empty list.
  const exposedWatchValues =
    watch.length === 0 ? EMPTY_WATCH_VALUES : watchValues;
  const exposedFrozen = watch.length === 0 ? EMPTY_FROZEN : frozen;

  /** Changing the value type invalidates every candidate, as in Cheat Engine. */
  const selectValueType = async (next: ScanValueType) => {
    if (next === valueType) return;
    await api.scan.reset(pid);
    setScanned(false);
    setValueType(next);
    if (!isFixedWidthType(next)) setFirstCompare('exact');
    setError(undefined);
  };

  const selectEncoding = async (next: ScanStringEncoding) => {
    if (next === encoding) return;
    await api.scan.reset(pid);
    setScanned(false);
    setEncoding(next);
    setError(undefined);
  };

  const firstScan = async () => {
    setError(undefined);
    let value: ScanValue | undefined;
    if (firstCompare === 'exact') {
      const parsed = parseScanValue(valueType, valueText);
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      value = parsed.value;
    } else if (!isFixedWidthType(valueType)) {
      setError(
        `"Bilinmeyen değer" taraması sabit genişlikli bir tip ister; "${valueType}" ile kullanılamaz.`,
      );
      return;
    }

    try {
      await api.scan.first(pid, {
        type: valueType,
        compare: firstCompare,
        value,
        encoding,
        mappingIds: mappingId ? [mappingId] : undefined,
      });
      setScanned(true);
    } catch (cause) {
      setError(describeError(cause));
    }
  };

  const nextScan = async () => {
    setError(undefined);
    let value: ScanValue | undefined;
    if (nextScanNeedsValue(nextCompare)) {
      const parsed = parseScanValue(valueType, valueText);
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      value = parsed.value;
    }

    try {
      await api.scan.next(pid, { compare: nextCompare, value });
      setFetchedReport(await api.scan.page(pid, 0, SCAN_PAGE_SIZE));
    } catch (cause) {
      setError(describeError(cause));
    }
  };

  const newScan = async () => {
    await api.scan.reset(pid);
    setScanned(false);
    setError(undefined);
  };

  /* ---------- result row actions ---------- */
  const gotoAddress = (address: bigint) => {
    void session.gotoMemory(address);
  };

  /** Writes through the scanner so the edit uses the scan's own type/encoding. */
  const editResult = async (address: bigint, raw: string): Promise<boolean> => {
    if (!report) return false;
    const parsed = parseScanValue(report.type, raw);
    if (!parsed.ok) {
      setError(parsed.error);
      return false;
    }
    try {
      await api.scan.writeValue(pid, address, parsed.value);
      setError(undefined);
      setFetchedReport(await api.scan.page(pid, 0, SCAN_PAGE_SIZE));
      return true;
    } catch (cause) {
      setError(describeError(cause));
      return false;
    }
  };

  /* ---------- watch list ---------- */
  const addWatch = (address: bigint) => {
    const type = report?.type ?? valueType;
    const size = report?.valueSize ?? FIXED_VALUE_SIZE[type] ?? 1;
    const entry: ScanWatchEntry = {
      id: (watchIdRef.current += 1),
      address,
      type,
      encoding,
      size,
    };
    setWatch((previous) =>
      previous.some((row) => row.address === address && row.type === entry.type)
        ? previous
        : [...previous, entry],
    );
  };

  const removeWatch = async (id: number) => {
    const entry = watch.find((row) => row.id === id);
    if (entry && (await api.scan.isFrozen(pid, entry.address))) {
      await api.scan.unfreeze(pid, entry.address);
    }
    setWatch((previous) => previous.filter((row) => row.id !== id));
  };

  /** Cached read for one watch row, refreshed by `refreshWatch`. */
  const readWatch = (
    entry: ScanWatchEntry,
  ): { value?: ScanValue; error?: string } =>
    exposedWatchValues.get(entry.id) ?? {};

  const editWatch = async (
    entry: ScanWatchEntry,
    raw: string,
  ): Promise<boolean> => {
    const parsed = parseScanValue(entry.type, raw);
    if (!parsed.ok) {
      setError(parsed.error);
      return false;
    }
    try {
      const bytes = await api.scan.writeTypedValue(
        pid,
        entry.address,
        entry.type,
        parsed.value,
        entry.encoding,
      );
      // A frozen row must freeze at the *new* value, not snap back to the old.
      if (await api.scan.isFrozen(pid, entry.address)) {
        await api.scan.freeze(pid, entry.address, bytes);
      }
      setError(undefined);
      const result = await refreshWatch();
      setWatchValues(result.values);
      setFrozen(result.frozen);
      setFrozenCount(result.count);
      return true;
    } catch (cause) {
      setError(describeError(cause));
      return false;
    }
  };

  const isFrozen = (address: bigint) => exposedFrozen.has(address.toString());

  const toggleFreeze = async (entry: ScanWatchEntry) => {
    try {
      if (await api.scan.isFrozen(pid, entry.address)) {
        await api.scan.unfreeze(pid, entry.address);
      } else {
        const value = await api.scan.readTypedValue(
          pid,
          entry.address,
          entry.size,
          entry.type,
          entry.encoding,
        );
        const bytes = await api.scan.writeTypedValue(
          pid,
          entry.address,
          entry.type,
          value,
          entry.encoding,
        );
        await api.scan.freeze(pid, entry.address, bytes);
      }
      setError(undefined);
      const result = await refreshWatch();
      setWatchValues(result.values);
      setFrozen(result.frozen);
      setFrozenCount(result.count);
    } catch (cause) {
      setError(describeError(cause));
    }
  };

  return {
    valueType,
    selectValueType,
    encoding,
    selectEncoding,
    valueText,
    setValueText,
    firstCompare,
    setFirstCompare,
    nextCompare,
    setNextCompare,
    mappingId,
    setMappingId,

    scanned,
    report,
    error: error ?? reportError,

    firstScan,
    nextScan,
    newScan,

    gotoAddress,
    editResult,

    watch,
    addWatch,
    removeWatch,
    readWatch,
    editWatch,
    isFrozen,
    toggleFreeze,
    frozenCount,
  };
}

export type ScannerSession = ReturnType<typeof useScannerSession>;
