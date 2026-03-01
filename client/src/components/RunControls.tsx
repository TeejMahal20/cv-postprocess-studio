import { Play, RotateCcw, Loader2, CheckCircle, XCircle } from 'lucide-react';
import type { ExecutionStatus } from '../types';

interface RunControlsProps {
  status: ExecutionStatus;
  executionTimeMs: number | null;
  onRun: () => void;
  disabled: boolean;
}

export default function RunControls({
  status,
  executionTimeMs,
  onRun,
  disabled,
}: RunControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onRun}
        disabled={disabled || status === 'running'}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-sm font-medium transition-colors"
      >
        {status === 'running' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : status === 'success' ? (
          <RotateCcw className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4" />
        )}
        {status === 'running'
          ? 'Running...'
          : status === 'success'
            ? 'Re-run'
            : 'Run'}
      </button>

      {/* Status indicator */}
      {status === 'success' && (
        <span className="flex items-center gap-1 text-xs text-green-400">
          <CheckCircle className="w-3.5 h-3.5" />
          Success
        </span>
      )}
      {status === 'error' && (
        <span className="flex items-center gap-1 text-xs text-red-400">
          <XCircle className="w-3.5 h-3.5" />
          Error
        </span>
      )}

      {/* Execution time */}
      {executionTimeMs !== null && (
        <span className="text-xs text-gray-500 ml-auto">
          {(executionTimeMs / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}
