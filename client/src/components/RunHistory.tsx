import { CheckCircle, XCircle, ArrowUpFromLine } from 'lucide-react';
import type { RunHistoryEntry } from '../../../shared/types';

interface RunHistoryProps {
  runs: RunHistoryEntry[];
  onLoadCode: (code: string) => void;
}

export default function RunHistory({ runs, onLoadCode }: RunHistoryProps) {
  if (runs.length === 0) {
    return (
      <div className="text-xs text-gray-500 py-1">No runs yet.</div>
    );
  }

  return (
    <div className="space-y-1 max-h-[150px] overflow-y-auto">
      {[...runs].reverse().map((run) => (
        <div
          key={run.id}
          className="flex items-center gap-2 px-2 py-1.5 rounded bg-gray-800 border border-gray-700 group"
        >
          {run.status === 'success' ? (
            <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
          ) : (
            <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <span className="text-[10px] text-gray-400">
              {new Date(run.timestamp).toLocaleTimeString()}
            </span>
            {run.ctq_count > 0 && (
              <span className="text-[10px] text-gray-500 ml-2">
                {run.ctq_count} features
              </span>
            )}
          </div>
          <button
            onClick={() => onLoadCode(run.code)}
            title="Load this code"
            className="p-1 rounded text-gray-500 hover:text-blue-400 hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ArrowUpFromLine className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
