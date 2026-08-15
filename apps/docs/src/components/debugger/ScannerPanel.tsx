'use client';

import { useState } from 'react';
import type { FirstScanCompare, NextScanCompare, ScanValueType } from '../../shell/common/channels';
import { GHOST_BUTTON_CLASS, INPUT_CLASS } from './chrome';
import { hex } from './format';
import { formatScanValue, isFixedWidthType, nextScanNeedsValue } from './useScannerSession';
import type { ScannerSession } from './useScannerSession';
import type { DebugSession } from './useDebugSession';

const VALUE_TYPE_LABEL: Record<ScanValueType, string> = {
  i8: '8-bit tam sayı',
  i16: '16-bit tam sayı',
  i32: '32-bit tam sayı',
  i64: '64-bit tam sayı',
  f32: 'float (4 byte)',
  f64: 'double (8 byte)',
  bytes: 'byte dizisi',
  string: 'metin',
};

const FIRST_COMPARE_LABEL: Record<FirstScanCompare, string> = {
  exact: 'Tam değer',
  unknown: 'Bilinmeyen değer',
};

const NEXT_COMPARE_LABEL: Record<NextScanCompare, string> = {
  exact: 'Tam değer',
  changed: 'Değişti',
  unchanged: 'Değişmedi',
  increased: 'Arttı',
  decreased: 'Azaldı',
  'bigger-than': 'Şundan büyük',
  'smaller-than': 'Şundan küçük',
};

const LABEL_CLASS = 'text-[0.65rem] font-semibold tracking-wide text-[#858585] uppercase';
const HEAD_CLASS = 'px-2 py-1 text-left font-semibold text-[#858585]';
const CELL_CLASS = 'px-2 py-1 align-middle';

export function ScannerPanel({
  scanner,
  session,
}: {
  scanner: ScannerSession;
  session: DebugSession;
}) {
  const [editingResult, setEditingResult] = useState<bigint>();
  const [resultDraft, setResultDraft] = useState('');
  const [editingWatch, setEditingWatch] = useState<number>();
  const [watchDraft, setWatchDraft] = useState('');

  const { report } = scanner;
  const valueNeeded =
    !scanner.scanned
      ? scanner.firstCompare === 'exact'
      : nextScanNeedsValue(scanner.nextCompare);

  const commitResult = async (address: bigint) => {
    if (await scanner.editResult(address, resultDraft)) setEditingResult(undefined);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ---------- scan controls ---------- */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#2d2d2d] px-3 py-1.5">
        <label className="flex items-center gap-1.5">
          <span className={LABEL_CLASS}>Tip</span>
          <select
            value={scanner.valueType}
            onChange={(event) =>
              scanner.selectValueType(event.target.value as ScanValueType)
            }
            className={INPUT_CLASS}
          >
            {(Object.keys(VALUE_TYPE_LABEL) as ScanValueType[]).map((type) => (
              <option key={type} value={type}>
                {VALUE_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </label>

        {scanner.valueType === 'string' && (
          <label className="flex items-center gap-1.5">
            <span className={LABEL_CLASS}>Kodlama</span>
            <select
              value={scanner.encoding}
              onChange={(event) =>
                scanner.selectEncoding(event.target.value as 'ascii' | 'utf16')
              }
              className={INPUT_CLASS}
            >
              <option value="ascii">ASCII</option>
              <option value="utf16">UTF-16</option>
            </select>
          </label>
        )}

        <label className="flex items-center gap-1.5">
          <span className={LABEL_CLASS}>Karşılaştırma</span>
          {!scanner.scanned ? (
            <select
              value={scanner.firstCompare}
              onChange={(event) =>
                scanner.setFirstCompare(event.target.value as FirstScanCompare)
              }
              className={INPUT_CLASS}
            >
              <option value="exact">{FIRST_COMPARE_LABEL.exact}</option>
              {/* An unknown-value scan has no needle, so it needs a fixed width. */}
              <option value="unknown" disabled={!isFixedWidthType(scanner.valueType)}>
                {FIRST_COMPARE_LABEL.unknown}
              </option>
            </select>
          ) : (
            <select
              value={scanner.nextCompare}
              onChange={(event) =>
                scanner.setNextCompare(event.target.value as NextScanCompare)
              }
              className={INPUT_CLASS}
            >
              {(Object.keys(NEXT_COMPARE_LABEL) as NextScanCompare[]).map((compare) => (
                <option key={compare} value={compare}>
                  {NEXT_COMPARE_LABEL[compare]}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="flex items-center gap-1.5">
          <span className={LABEL_CLASS}>Değer</span>
          <input
            value={scanner.valueText}
            onChange={(event) => scanner.setValueText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              if (scanner.scanned) scanner.nextScan();
              else scanner.firstScan();
            }}
            disabled={!valueNeeded}
            placeholder={scanner.valueType === 'bytes' ? '48 89 5C' : '1000'}
            className={`${INPUT_CLASS} w-32 disabled:opacity-40`}
          />
        </label>

        {!scanner.scanned && (
          <label className="flex items-center gap-1.5">
            <span className={LABEL_CLASS}>Bölge</span>
            <select
              value={scanner.mappingId}
              onChange={(event) => scanner.setMappingId(event.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">Tüm mapping&apos;ler</option>
              {session.mappings.map((mapping) => (
                <option key={mapping.id} value={mapping.id}>
                  {mapping.label} · {mapping.protection}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {!scanner.scanned ? (
            <button type="button" onClick={scanner.firstScan} className={GHOST_BUTTON_CLASS}>
              İlk tarama
            </button>
          ) : (
            <>
              <button type="button" onClick={scanner.nextScan} className={GHOST_BUTTON_CLASS}>
                Sonraki tarama
              </button>
              <button type="button" onClick={scanner.newScan} className={GHOST_BUTTON_CLASS}>
                Yeni tarama
              </button>
            </>
          )}
        </div>
      </div>

      {scanner.error && (
        <div className="shrink-0 border-b border-[#2d2d2d] bg-[#5a1d1d] px-3 py-1 font-mono text-[0.68rem] text-[#f5b5b5]">
          {scanner.error}
        </div>
      )}

      {/* ---------- results + watch list ---------- */}
      <div className="flex min-h-0 flex-1">
        {/* results */}
        <div className="flex min-h-0 flex-1 flex-col border-r border-[#2d2d2d]">
          <div className="flex shrink-0 items-center gap-2 px-3 py-1 font-mono text-[0.68rem] text-[#858585]">
            {!scanner.scanned ? (
              <span>Henüz tarama yapılmadı.</span>
            ) : (
              <>
                <span>
                  {report?.total.toLocaleString('tr-TR') ?? 0} sonuç
                  {report?.truncated
                    ? ` · ilk ${report.results.length.toLocaleString('tr-TR')} tanesi listeleniyor`
                    : ''}
                </span>
                {report?.total === 0 && <span>· daraltmayı geri almak için &quot;Yeni tarama&quot;</span>}
              </>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {report && report.results.length > 0 && (
              <table className="w-full border-collapse font-mono text-[0.7rem]">
                <thead className="sticky top-0 bg-[#252526]">
                  <tr>
                    <th className={HEAD_CLASS}>Adres</th>
                    <th className={HEAD_CLASS}>Değer</th>
                    <th className={HEAD_CLASS}>Önceki</th>
                    <th className={HEAD_CLASS} />
                  </tr>
                </thead>
                <tbody>
                  {report.results.map((result) => (
                    <tr key={result.address.toString()} className="border-t border-[#2d2d2d]">
                      <td className={`${CELL_CLASS} text-[#9cdcfe]`}>{hex(result.address)}</td>
                      <td className={CELL_CLASS}>
                        {editingResult === result.address ? (
                          <input
                            autoFocus
                            value={resultDraft}
                            onChange={(event) => setResultDraft(event.target.value)}
                            onBlur={() => commitResult(result.address)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                commitResult(result.address);
                              } else if (event.key === 'Escape') {
                                event.preventDefault();
                                setEditingResult(undefined);
                              }
                            }}
                            className={`${INPUT_CLASS} w-24`}
                          />
                        ) : (
                          <span className="text-[#ce9178]">{formatScanValue(result.value)}</span>
                        )}
                      </td>
                      <td className={`${CELL_CLASS} text-[#858585]`}>
                        {formatScanValue(result.previousValue)}
                      </td>
                      <td className={`${CELL_CLASS} text-right whitespace-nowrap`}>
                        <button
                          type="button"
                          onClick={() => scanner.gotoAddress(result.address)}
                          className={GHOST_BUTTON_CLASS}
                          title="Bellek panelinde bu adrese git"
                        >
                          Git
                        </button>{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingResult(result.address);
                            setResultDraft(formatScanValue(result.value));
                          }}
                          className={GHOST_BUTTON_CLASS}
                        >
                          Düzenle
                        </button>{' '}
                        <button
                          type="button"
                          onClick={() => scanner.addWatch(result.address)}
                          className={GHOST_BUTTON_CLASS}
                          title="Adres listesine ekle"
                        >
                          Ekle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* watch list */}
        <div className="flex min-h-0 w-[46%] flex-col">
          <div className="flex shrink-0 items-center gap-2 px-3 py-1 font-mono text-[0.68rem] text-[#858585]">
            <span>Adres listesi · {scanner.watch.length}</span>
            {scanner.frozenCount > 0 && (
              <span className="text-[#4ec9b0]">· {scanner.frozenCount} donduruldu</span>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {scanner.watch.length === 0 ? (
              <p className="px-3 py-2 font-mono text-[0.68rem] text-[#858585]">
                Sonuç tablosundan &quot;Ekle&quot; ile adres sabitleyin. Dondurulan adres her
                thread durağında aynı değere geri yazılır.
              </p>
            ) : (
              <table className="w-full border-collapse font-mono text-[0.7rem]">
                <thead className="sticky top-0 bg-[#252526]">
                  <tr>
                    <th className={HEAD_CLASS}>Adres</th>
                    <th className={HEAD_CLASS}>Tip</th>
                    <th className={HEAD_CLASS}>Değer</th>
                    <th className={HEAD_CLASS}>Dondur</th>
                    <th className={HEAD_CLASS} />
                  </tr>
                </thead>
                <tbody>
                  {scanner.watch.map((entry) => {
                    const live = scanner.readWatch(entry);
                    const frozen = scanner.isFrozen(entry.address);
                    return (
                      <tr key={entry.id} className="border-t border-[#2d2d2d]">
                        <td className={`${CELL_CLASS} text-[#9cdcfe]`}>{hex(entry.address)}</td>
                        <td className={`${CELL_CLASS} text-[#858585]`}>{entry.type}</td>
                        <td className={CELL_CLASS}>
                          {editingWatch === entry.id ? (
                            <input
                              autoFocus
                              value={watchDraft}
                              onChange={(event) => setWatchDraft(event.target.value)}
                              onBlur={async () => {
                                if (await scanner.editWatch(entry, watchDraft)) setEditingWatch(undefined);
                              }}
                              onKeyDown={async (event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  if (await scanner.editWatch(entry, watchDraft)) setEditingWatch(undefined);
                                } else if (event.key === 'Escape') {
                                  event.preventDefault();
                                  setEditingWatch(undefined);
                                }
                              }}
                              className={`${INPUT_CLASS} w-24`}
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                if (live.value === undefined) return;
                                setEditingWatch(entry.id);
                                setWatchDraft(formatScanValue(live.value));
                              }}
                              className="cursor-pointer text-[#ce9178] hover:underline"
                              title="Değeri düzenle"
                            >
                              {live.error ? (
                                <span className="text-[#f5b5b5]">okunamadı</span>
                              ) : live.value === undefined ? (
                                <span className="text-[#858585]">…</span>
                              ) : (
                                formatScanValue(live.value)
                              )}
                            </button>
                          )}
                        </td>
                        <td className={CELL_CLASS}>
                          <input
                            type="checkbox"
                            checked={frozen}
                            onChange={() => scanner.toggleFreeze(entry)}
                            className="cursor-pointer accent-[#007acc]"
                            aria-label={`${hex(entry.address)} adresini dondur`}
                          />
                        </td>
                        <td className={`${CELL_CLASS} text-right whitespace-nowrap`}>
                          <button
                            type="button"
                            onClick={() => scanner.gotoAddress(entry.address)}
                            className={GHOST_BUTTON_CLASS}
                          >
                            Git
                          </button>{' '}
                          <button
                            type="button"
                            onClick={() => scanner.removeWatch(entry.id)}
                            className={GHOST_BUTTON_CLASS}
                          >
                            Sil
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
