import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  MessageSquare,
  Trash2,
  BookOpen,
  ChevronDown,
  ChevronRight,
  History,
} from 'lucide-react';
import type {
  UploadResponse,
  CalibrationConfig,
  ExecuteResponse,
  RecipeListItem,
  RunHistoryEntry,
} from '../../../shared/types';
import type { ExecutionStatus, ChatMessage } from '../types';
import { fetchSessionRuns } from '../api';
import CodeEditor from './CodeEditor';
import RunControls from './RunControls';
import ResultsPanel from './ResultsPanel';
import RecipeBrowser from './RecipeBrowser';
import RunHistory from './RunHistory';
import SaveRecipeDialog from './SaveRecipeDialog';

interface AgentPanelProps {
  sessionId: string;
  uploadResult: UploadResponse;
  calibration: CalibrationConfig;
  code: string;
  setCode: (c: string) => void;
  executionResult: ExecuteResponse | null;
  isGenerating: boolean;
  isExecuting: boolean;
  chatHistory: ChatMessage[];
  onGenerate: (prompt: string) => Promise<void>;
  onGenerateAndRun: (prompt: string) => Promise<void>;
  onRun: () => void;
  onClearHistory: () => void;
  // Recipe props
  recipes: RecipeListItem[];
  recipesLoading: boolean;
  onSaveRecipe: (name: string, description: string, tags: string[]) => void;
  onLoadRecipe: (id: string) => void;
  onDeleteRecipe: (id: string) => void;
  onDownloadRecipe: (id: string) => void;
  onPromoteRecipe: (id: string, name: string) => void;
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const [expanded, setExpanded] = useState(false);

  const bubbleClass =
    message.role === 'user'
      ? 'bg-gray-700 ml-6'
      : message.role === 'error'
        ? 'bg-red-900/30 border border-red-800'
        : message.role === 'system'
          ? 'bg-blue-900/20 border border-blue-800/40'
          : 'bg-gray-800 mr-2';

  const roleLabel =
    message.role === 'assistant' ? 'Agent' : message.role;

  return (
    <div className={`p-2 rounded text-xs ${bubbleClass}`}>
      <span className="text-gray-500 capitalize text-[10px]">{roleLabel}</span>
      {message.content && (
        <p className="mt-0.5 text-gray-300 whitespace-pre-wrap">{message.content}</p>
      )}
      {message.code && (
        <div className="mt-1.5">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-[10px] text-gray-500 hover:text-gray-300 flex items-center gap-1 mb-1"
          >
            {expanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            Generated code ({message.code.split('\n').length} lines)
          </button>
          {expanded && (
            <pre className="text-[10px] bg-gray-900 p-2 rounded overflow-auto max-h-[200px] text-gray-400">
              {message.code}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

const EXAMPLE_PROMPTS = [
  'Measure area and roundness of all features',
  'Compute width and height of each bounding box in mm',
  'Count defects per category and summarize',
];

export default function AgentPanel({
  sessionId,
  code,
  setCode,
  executionResult,
  isGenerating,
  isExecuting,
  chatHistory,
  onGenerate,
  onGenerateAndRun,
  onRun,
  onClearHistory,
  recipes,
  recipesLoading,
  onSaveRecipe,
  onLoadRecipe,
  onDeleteRecipe,
  onDownloadRecipe,
  onPromoteRecipe,
}: AgentPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [showRecipes, setShowRecipes] = useState(false);
  const [showRunHistory, setShowRunHistory] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [runs, setRuns] = useState<RunHistoryEntry[]>([]);

  const executionStatus: ExecutionStatus = isExecuting
    ? 'running'
    : executionResult?.success
      ? 'success'
      : executionResult
        ? 'error'
        : 'idle';

  // Refresh run history when execution completes
  useEffect(() => {
    if (executionResult) {
      fetchSessionRuns(sessionId)
        .then(setRuns)
        .catch(console.error);
    }
  }, [sessionId, executionResult]);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    await onGenerate(prompt.trim());
    setPrompt('');
  };

  const handleGenerateAndRun = async () => {
    if (!prompt.trim()) return;
    await onGenerateAndRun(prompt.trim());
    setPrompt('');
  };

  const handleSaveRecipe = useCallback(
    (name: string, description: string, tags: string[]) => {
      onSaveRecipe(name, description, tags);
      setShowSaveDialog(false);
    },
    [onSaveRecipe],
  );

  // Get the last user prompt for pre-filling save dialog
  const lastPrompt =
    [...chatHistory].reverse().find((m) => m.role === 'user')?.content || '';

  return (
    <div className="space-y-4">
      {/* Header with recipe toggle */}
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Agent
        </h2>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setShowRecipes((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
              showRecipes
                ? 'bg-blue-600/20 text-blue-400'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
            }`}
            title="Saved recipes"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Recipes
            {recipes.length > 0 && (
              <span className="text-[9px] bg-gray-700 rounded-full px-1.5">
                {recipes.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Recipe browser (collapsible) */}
      {showRecipes && (
        <div className="border border-gray-700 rounded p-2 bg-gray-850">
          <RecipeBrowser
            recipes={recipes}
            isLoading={recipesLoading}
            onLoad={onLoadRecipe}
            onDelete={onDeleteRecipe}
            onDownload={onDownloadRecipe}
            onPromote={onPromoteRecipe}
          />
        </div>
      )}

      {/* Run history (collapsible) */}
      {runs.length > 0 && (
        <div>
          <button
            onClick={() => setShowRunHistory((v) => !v)}
            className="flex items-center gap-1 text-[10px] text-gray-500 uppercase tracking-wider hover:text-gray-300 mb-1"
          >
            {showRunHistory ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <History className="w-3 h-3" />
            Runs ({runs.length})
          </button>
          {showRunHistory && (
            <RunHistory runs={runs} onLoadCode={setCode} />
          )}
        </div>
      )}

      {/* Chat history */}
      {chatHistory.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">
              History ({chatHistory.length})
            </span>
            <button
              onClick={onClearHistory}
              className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          </div>
          <div className="space-y-2 max-h-[350px] overflow-y-auto">
            {chatHistory.map((msg, i) => (
              <ChatBubble key={i} message={msg} />
            ))}
          </div>
        </div>
      )}

      {/* Prompt input */}
      <div className="space-y-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the measurements you want to extract..."
          className="w-full h-20 px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm resize-none focus:border-blue-500 focus:outline-none placeholder-gray-500"
        />

        {/* Example prompts */}
        <div className="flex flex-wrap gap-1">
          {EXAMPLE_PROMPTS.map((ex) => (
            <button
              key={ex}
              onClick={() => setPrompt(ex)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 hover:text-gray-300 hover:bg-gray-700 truncate max-w-[180px]"
            >
              {ex}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-sm font-medium transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            {isGenerating ? 'Generating...' : 'Generate'}
          </button>
          <button
            onClick={handleGenerateAndRun}
            disabled={!prompt.trim() || isGenerating || isExecuting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-sm font-medium transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            {isGenerating
              ? 'Generating...'
              : isExecuting
                ? 'Running...'
                : 'Generate & Run'}
          </button>
        </div>
      </div>

      {/* Code editor */}
      {code && (
        <CodeEditor
          code={code}
          onChange={setCode}
          onSaveRecipe={() => setShowSaveDialog(true)}
        />
      )}

      {/* Run controls */}
      {code && (
        <RunControls
          status={executionStatus}
          executionTimeMs={executionResult?.execution_time_ms ?? null}
          onRun={onRun}
          disabled={!code || isGenerating}
        />
      )}

      {/* Results */}
      <ResultsPanel result={executionResult} />

      {/* Save recipe dialog */}
      {showSaveDialog && (
        <SaveRecipeDialog
          defaultDescription={lastPrompt}
          onSave={handleSaveRecipe}
          onCancel={() => setShowSaveDialog(false)}
        />
      )}
    </div>
  );
}
