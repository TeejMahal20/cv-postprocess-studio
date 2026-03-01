import { useState, useCallback } from 'react';
import type {
  UploadResponse,
  COCODataset,
  CalibrationConfig,
  ExecuteResponse,
  PromoteRequest,
} from '../../shared/types';
import Layout from './components/Layout';
import PromoteDialog from './components/PromoteDialog';
import { useAgent } from './hooks/useAgent';
import { useExecution } from './hooks/useExecution';
import { useRecipes } from './hooks/useRecipes';

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [cocoData, setCocoData] = useState<COCODataset | null>(null);
  const [calibration, setCalibration] = useState<CalibrationConfig>({
    enabled: false,
    pixels_per_mm: 10.0,
    unit_label: 'mm',
  });
  const [code, setCode] = useState('');
  const [executionResult, setExecutionResult] =
    useState<ExecuteResponse | null>(null);
  const [highlightedFeature, setHighlightedFeature] = useState<number | null>(
    null,
  );

  const agent = useAgent();
  const execution = useExecution();
  const recipeStore = useRecipes();

  // Sync execution result to top-level state + add to chat history
  const handleExecutionResult = useCallback(
    (result: ExecuteResponse) => {
      setExecutionResult(result);
      const summary = result.success
        ? `Execution succeeded in ${(result.execution_time_ms / 1000).toFixed(1)}s. ${
            result.result?.ctq_results?.length
              ? `${result.result.ctq_results.length} features measured.`
              : ''
          }`
        : `Execution failed: ${result.error || 'Unknown error'}`;
      agent.addSystemMessage(summary);
    },
    [agent],
  );

  const handleGenerate = useCallback(
    async (prompt: string) => {
      if (!sessionId || !uploadResult) return;
      const response = await agent.generate(prompt, {
        sessionId,
        uploadResult,
        calibration,
        previousCode: code || null,
        previousResult: executionResult?.result || null,
        previousError: executionResult?.error || null,
      });
      setCode(response.code);
    },
    [sessionId, uploadResult, calibration, code, executionResult, agent],
  );

  const handleGenerateAndRun = useCallback(
    async (prompt: string) => {
      if (!sessionId || !uploadResult) return;
      const response = await agent.generate(prompt, {
        sessionId,
        uploadResult,
        calibration,
        previousCode: code || null,
        previousResult: executionResult?.result || null,
        previousError: executionResult?.error || null,
      });
      setCode(response.code);
      const result = await execution.execute(
        sessionId,
        response.code,
        calibration,
      );
      handleExecutionResult(result);
    },
    [sessionId, uploadResult, calibration, code, executionResult, agent, execution, handleExecutionResult],
  );

  const handleRun = useCallback(async () => {
    if (!sessionId || !code) return;
    const result = await execution.execute(sessionId, code, calibration);
    handleExecutionResult(result);
  }, [sessionId, code, calibration, execution, handleExecutionResult]);

  const handleSaveRecipe = useCallback(
    (name: string, description: string, tags: string[]) => {
      if (!uploadResult) return;
      recipeStore.save({
        name,
        description,
        code,
        prompt:
          [...agent.chatHistory].reverse().find((m) => m.role === 'user')
            ?.content || '',
        chat_history: agent.chatHistory,
        last_result: executionResult?.result || null,
        tags,
        source: {
          image_filename: uploadResult.image.filename,
          image_dimensions: {
            width: uploadResult.image.width,
            height: uploadResult.image.height,
          },
          categories: uploadResult.coco.categories.map((c) => c.name),
          annotation_count: uploadResult.coco.annotation_count,
        },
      });
    },
    [code, uploadResult, executionResult, agent.chatHistory, recipeStore],
  );

  const handleLoadRecipe = useCallback(
    async (id: string) => {
      if (!sessionId) return;
      const recipe = await recipeStore.load(id);
      setCode(recipe.code);
      agent.setHistory(recipe.chat_history || []);
      // Run the recipe code against the current session/image
      const result = await execution.execute(sessionId, recipe.code, calibration);
      handleExecutionResult(result);
    },
    [recipeStore, agent, sessionId, calibration, execution, handleExecutionResult],
  );

  // --- Promotion state ---
  const [promoteTarget, setPromoteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const handlePromoteRecipe = useCallback(
    (id: string, name: string) => {
      recipeStore.clearPromoteStatus();
      setPromoteTarget({ id, name });
    },
    [recipeStore],
  );

  const handleDoPromote = useCallback(
    async (request: PromoteRequest) => {
      if (!promoteTarget) return;
      await recipeStore.promote(promoteTarget.id, request);
    },
    [promoteTarget, recipeStore],
  );

  const handleClosePromote = useCallback(() => {
    setPromoteTarget(null);
    recipeStore.clearPromoteStatus();
  }, [recipeStore]);

  const handleDownloadRecipe = useCallback(
    async (id: string) => {
      const recipe = await recipeStore.load(id);
      const blob = new Blob([recipe.code], { type: 'text/x-python' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${recipe.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.py`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [recipeStore],
  );

  return (
  <>
    <Layout
      sessionId={sessionId}
      setSessionId={setSessionId}
      uploadResult={uploadResult}
      setUploadResult={setUploadResult}
      cocoData={cocoData}
      setCocoData={setCocoData}
      calibration={calibration}
      setCalibration={setCalibration}
      code={code}
      setCode={setCode}
      executionResult={executionResult}
      setExecutionResult={setExecutionResult}
      highlightedFeature={highlightedFeature}
      setHighlightedFeature={setHighlightedFeature}
      // Agent props
      isGenerating={agent.isGenerating}
      isExecuting={execution.isExecuting}
      chatHistory={agent.chatHistory}
      onGenerate={handleGenerate}
      onGenerateAndRun={handleGenerateAndRun}
      onRun={handleRun}
      onClearHistory={agent.clearHistory}
      // Recipe props
      recipes={recipeStore.recipes}
      recipesLoading={recipeStore.isLoading}
      onSaveRecipe={handleSaveRecipe}
      onLoadRecipe={handleLoadRecipe}
      onDeleteRecipe={recipeStore.remove}
      onDownloadRecipe={handleDownloadRecipe}
      onPromoteRecipe={handlePromoteRecipe}
    />
    {promoteTarget && (
      <PromoteDialog
        recipeName={promoteTarget.name}
        promoteStatus={recipeStore.promoteStatus}
        onPromote={handleDoPromote}
        onClose={handleClosePromote}
      />
    )}
  </>
  );
}
