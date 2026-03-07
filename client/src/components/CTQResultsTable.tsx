import { useState, useMemo, useCallback } from 'react';
import { ArrowUpDown, Copy, Check } from 'lucide-react';
import type { CTQResult } from '../../../shared/types';

interface CTQResultsTableProps {
  results: CTQResult[];
  onHighlightFeature: (id: number | null) => void;
}

type SortKey = 'feature_id' | 'label' | string;
type SortDir = 'asc' | 'desc';

/** Safely format a measurement value that may be a number, string, or other type */
function formatVal(v: unknown, decimals: number): string {
  if (v == null) return '-';
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n.toFixed(decimals) : String(v);
}

export default function CTQResultsTable({
  results,
  onHighlightFeature,
}: CTQResultsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('feature_id');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [copied, setCopied] = useState(false);

  // Collect all measurement keys across features
  const measurementKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const r of results) {
      if (r.measurements && typeof r.measurements === 'object') {
        for (const k of Object.keys(r.measurements)) {
          keys.add(k);
        }
      }
    }
    return Array.from(keys);
  }, [results]);

  // Sort
  const displayed = useMemo(() => {
    const items = [...results];

    items.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'feature_id') {
        cmp = a.feature_id - b.feature_id;
      } else if (sortKey === 'label') {
        cmp = (a.label || '').localeCompare(b.label || '');
      } else {
        const av = Number(a.measurements?.[sortKey]) || -Infinity;
        const bv = Number(b.measurements?.[sortKey]) || -Infinity;
        cmp = av - bv;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return items;
  }, [results, sortKey, sortDir]);

  // Summary row
  const averages = useMemo(() => {
    const sums: Record<string, number> = {};
    const counts: Record<string, number> = {};
    for (const r of results) {
      if (!r.measurements || typeof r.measurements !== 'object') continue;
      for (const [k, raw] of Object.entries(r.measurements)) {
        const v = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(v)) continue;
        sums[k] = (sums[k] || 0) + v;
        counts[k] = (counts[k] || 0) + 1;
      }
    }
    const avgs: Record<string, number> = {};
    for (const k of Object.keys(sums)) {
      avgs[k] = sums[k] / counts[k];
    }
    return avgs;
  }, [results]);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
    },
    [sortKey],
  );

  const copyAsCSV = useCallback(async () => {
    const headers = ['ID', 'Label', 'Category', ...measurementKeys];
    const rows = displayed.map((r) => [
      r.feature_id,
      r.label,
      r.category || '',
      ...measurementKeys.map((k) =>
        r.measurements?.[k] != null ? formatVal(r.measurements[k], 4) : '',
      ),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    await navigator.clipboard.writeText(csv);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [displayed, measurementKeys]);

  if (results.length === 0) return null;

  return (
    <div className="border border-gray-700 rounded overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Results ({results.length} features)
        </h3>
        <button
          onClick={copyAsCSV}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-400 hover:text-gray-200"
        >
          {copied ? (
            <Check className="w-3 h-3 text-green-400" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
          CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-auto max-h-[300px]">
        <table className="w-full text-xs">
          <thead className="bg-gray-800 sticky top-0">
            <tr>
              <SortHeader
                label="ID"
                sortKey="feature_id"
                current={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Label"
                sortKey="label"
                current={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
              {measurementKeys.map((k) => (
                <SortHeader
                  key={k}
                  label={k}
                  sortKey={k}
                  current={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.map((r) => (
              <tr
                key={r.feature_id}
                className="border-t border-gray-800 hover:bg-gray-800/50 cursor-pointer"
                onClick={() => onHighlightFeature(r.feature_id)}
                onMouseLeave={() => onHighlightFeature(null)}
              >
                <td className="px-2 py-1.5 text-gray-400">{r.feature_id}</td>
                <td className="px-2 py-1.5 text-gray-300">{r.label}</td>
                {measurementKeys.map((k) => {
                  const val = r.measurements?.[k];
                  return (
                    <td
                      key={k}
                      className="px-2 py-1.5 font-mono text-gray-300"
                    >
                      {formatVal(val, 3)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {/* Summary row */}
            <tr className="border-t-2 border-gray-600 bg-gray-800/80 font-semibold">
              <td className="px-2 py-1.5 text-gray-500" colSpan={2}>
                Average
              </td>
              {measurementKeys.map((k) => (
                <td key={k} className="px-2 py-1.5 font-mono text-gray-400">
                  {formatVal(averages[k], 3)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  current,
  dir,
  onSort,
}: {
  label: string;
  sortKey: string;
  current: string;
  dir: SortDir;
  onSort: (key: string) => void;
}) {
  const active = current === sortKey;
  return (
    <th
      className="px-2 py-1.5 text-left text-gray-400 cursor-pointer hover:text-gray-200 whitespace-nowrap select-none"
      onClick={() => onSort(sortKey)}
    >
      <span className="flex items-center gap-1">
        {label}
        <ArrowUpDown
          className={`w-3 h-3 ${active ? 'text-blue-400' : 'text-gray-600'}`}
        />
        {active && (
          <span className="text-[10px] text-blue-400">
            {dir === 'asc' ? 'asc' : 'desc'}
          </span>
        )}
      </span>
    </th>
  );
}
