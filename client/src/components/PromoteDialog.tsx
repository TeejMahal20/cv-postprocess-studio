import { useState } from 'react';
import { X, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import type { PromoteRequest, PromoteResponse } from '../../../shared/types';
import type { PromoteStatus } from '../hooks/useRecipes';

interface PromoteDialogProps {
  recipeName: string;
  promoteStatus: PromoteStatus;
  onPromote: (request: PromoteRequest) => void;
  onClose: () => void;
}

function sanitizeModelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '');
}

export default function PromoteDialog({
  recipeName,
  promoteStatus,
  onPromote,
  onClose,
}: PromoteDialogProps) {
  const [modelName, setModelName] = useState(sanitizeModelName(recipeName));

  const isPromoting = promoteStatus.state === 'promoting';
  const isValid = /^[a-zA-Z0-9_-]+$/.test(modelName);

  const handlePromote = () => {
    if (!isValid || isPromoting) return;
    onPromote({ model_name: modelName });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-800 border border-gray-700 rounded-lg w-[420px] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-200">
            Promote to Triton
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {promoteStatus.state === 'success' ? (
          <SuccessView result={promoteStatus.result} onClose={onClose} />
        ) : promoteStatus.state === 'error' ? (
          <ErrorView error={promoteStatus.error} onClose={onClose} />
        ) : (
          <>
            <p className="text-xs text-gray-400">
              Transform the recipe <strong>{recipeName}</strong> into a Triton
              Inference Server Python backend model.
            </p>

            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Model name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="e.g. defect_distance_v1"
                className="w-full px-3 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm focus:border-blue-500 focus:outline-none"
                autoFocus
                disabled={isPromoting}
              />
              {modelName && !isValid && (
                <p className="text-[10px] text-red-400 mt-1">
                  Only letters, numbers, hyphens, and underscores allowed.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={onClose}
                disabled={isPromoting}
                className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-gray-200 bg-gray-700 hover:bg-gray-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePromote}
                disabled={!isValid || isPromoting}
                className="px-3 py-1.5 rounded text-sm font-medium bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 flex items-center gap-1.5"
              >
                {isPromoting && <Loader2 className="w-3 h-3 animate-spin" />}
                {isPromoting ? 'Promoting...' : 'Promote'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SuccessView({
  result,
  onClose,
}: {
  result: PromoteResponse;
  onClose: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm text-green-400 font-medium">
            Model promoted successfully
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Model <strong>{result.model_name}</strong> has been written to the
            Triton model repository.
          </p>
        </div>
      </div>

      <div className="text-[10px] text-gray-500 bg-gray-900 rounded p-2 space-y-1 font-mono">
        <div>config.pbtxt: {result.artifacts.config_pbtxt}</div>
        <div>model.py: {result.artifacts.model_py}</div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-200"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function ErrorView({
  error,
  onClose,
}: {
  error: string;
  onClose: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm text-red-400 font-medium">Promotion failed</p>
          <p className="text-xs text-gray-400 mt-1">{error}</p>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-200"
        >
          Close
        </button>
      </div>
    </div>
  );
}
