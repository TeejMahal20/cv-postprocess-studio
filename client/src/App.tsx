import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  UploadResponse,
  COCODataset,
  CalibrationConfig,
  ExecuteResponse,
  PromoteRequest,
  HumanAnnotation,
  DrawingTool,
  ImageEntry,
} from '../../shared/types';
import Layout from './components/Layout';
import type { CanvasViewerHandle } from './components/CanvasViewer';
import PromoteDialog from './components/PromoteDialog';
import { useAgent } from './hooks/useAgent';
import { useExecution } from './hooks/useExecution';
import { useRecipes } from './hooks/useRecipes';
import { switchImage } from './api';

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
  const [humanAnnotations, setHumanAnnotations] = useState<HumanAnnotation[]>([]);
  const [activeTool, setActiveTool] = useState<DrawingTool>('pan');

  // Multi-image state
  const [imageList, setImageList] = useState<ImageEntry[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isSwitchingImage, setIsSwitchingImage] = useState(false);

  // Canvas snapshot for vision input
  const canvasViewerRef = useRef<CanvasViewerHandle>(null);
  const [snapshotMode, setSnapshotMode] = useState<'annotations' | 'full'>('annotations');

  const agent = useAgent();
  const execution = useExecution();
  const recipeStore = useRecipes();

  // Refs for stable access in callbacks
  const codeRef = useRef(code);
  codeRef.current = code;
  const calibrationRef = useRef(calibration);
  calibrationRef.current = calibration;

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

  const handleAddAnnotation = useCallback((anno: HumanAnnotation) => {
    setHumanAnnotations(prev => [...prev, anno]);
  }, []);

  const handleUndoAnnotation = useCallback(() => {
    setHumanAnnotations(prev => prev.slice(0, -1));
  }, []);

  const handleClearAnnotations = useCallback(() => {
    setHumanAnnotations([]);
  }, []);

  const handleGenerate = useCallback(
    async (prompt: string) => {
      if (!sessionId || !uploadResult) return;
      try {
        // Capture canvas snapshot if there are human annotations
        const snapshot = humanAnnotations.length > 0
          ? canvasViewerRef.current?.captureSnapshot(snapshotMode === 'full') ?? null
          : null;
        const response = await agent.generate(prompt, {
          sessionId,
          uploadResult,
          calibration,
          previousCode: code || null,
          previousResult: executionResult?.result || null,
          previousError: executionResult?.error || null,
          humanAnnotations,
          canvasSnapshot: snapshot,
        });
        if (response.code) setCode(response.code);
      } catch (err) {
        console.error('[App] handleGenerate error:', err);
        agent.addSystemMessage(`Generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    },
    [sessionId, uploadResult, calibration, code, executionResult, agent, humanAnnotations, snapshotMode],
  );

  const handleGenerateAndRun = useCallback(
    async (prompt: string) => {
      if (!sessionId || !uploadResult) return;
      try {
        // Capture canvas snapshot if there are human annotations
        const snapshot = humanAnnotations.length > 0
          ? canvasViewerRef.current?.captureSnapshot(snapshotMode === 'full') ?? null
          : null;
        const response = await agent.generate(prompt, {
          sessionId,
          uploadResult,
          calibration,
          previousCode: code || null,
          previousResult: executionResult?.result || null,
          previousError: executionResult?.error || null,
          humanAnnotations,
          canvasSnapshot: snapshot,
        });
        if (response.code) {
          setCode(response.code);
          const result = await execution.execute(
            sessionId,
            response.code,
            calibration,
          );
          handleExecutionResult(result);
        }
      } catch (err) {
        console.error('[App] handleGenerateAndRun error:', err);
        agent.addSystemMessage(`Generate & Run failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    },
    [sessionId, uploadResult, calibration, code, executionResult, agent, execution, handleExecutionResult, humanAnnotations, snapshotMode],
  );

  const handleChat = useCallback(
    async (prompt: string) => {
      if (!sessionId || !uploadResult) return;
      try {
        const snapshot = humanAnnotations.length > 0
          ? canvasViewerRef.current?.captureSnapshot(snapshotMode === 'full') ?? null
          : null;
        await agent.chat(prompt, {
          sessionId,
          uploadResult,
          calibration,
          previousCode: code || null,
          previousResult: executionResult?.result || null,
          previousError: executionResult?.error || null,
          humanAnnotations,
          canvasSnapshot: snapshot,
        });
      } catch (err) {
        console.error('[App] handleChat error:', err);
        agent.addSystemMessage(`Chat failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    },
    [sessionId, uploadResult, calibration, code, executionResult, agent, humanAnnotations, snapshotMode],
  );

  const handleRun = useCallback(async () => {
    if (!sessionId || !code) return;
    try {
      const result = await execution.execute(sessionId, code, calibration);
      handleExecutionResult(result);
    } catch (err) {
      console.error('[App] handleRun error:', err);
      agent.addSystemMessage(`Execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [sessionId, code, calibration, execution, handleExecutionResult, agent]);

  // --- Multi-image navigation ---

  const handleSwitchImage = useCallback(
    async (index: number) => {
      if (!sessionId || isSwitchingImage) return;
      if (index < 0 || index >= imageList.length) return;
      if (index === currentImageIndex) return;

      setIsSwitchingImage(true);
      try {
        const result = await switchImage(sessionId, index);

        setCurrentImageIndex(index);

        // Update uploadResult with new image info
        setUploadResult(prev =>
          prev
            ? {
                ...prev,
                image: result.image,
                coco: result.coco,
                current_index: index,
              }
            : null,
        );

        // Set filtered COCO for canvas rendering
        setCocoData(result.filtered_coco);

        // Clear image-specific state
        setExecutionResult(null);
        setHumanAnnotations([]);
        setHighlightedFeature(null);

        // Auto-execute if there's code
        if (codeRef.current) {
          const execResult = await execution.execute(
            sessionId,
            codeRef.current,
            calibrationRef.current,
          );
          handleExecutionResult(execResult);
        }
      } catch (err) {
        console.error('Failed to switch image:', err);
        agent.addSystemMessage(
          `Failed to switch to image ${imageList[index]?.filename}: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`,
        );
      } finally {
        setIsSwitchingImage(false);
      }
    },
    [sessionId, imageList, currentImageIndex, isSwitchingImage, execution, handleExecutionResult, agent],
  );

  // Keyboard shortcuts for image navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        handleSwitchImage(currentImageIndex - 1);
      } else if (e.key === 'ArrowRight') {
        handleSwitchImage(currentImageIndex + 1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentImageIndex, handleSwitchImage]);

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
      try {
        const recipe = await recipeStore.load(id);
        setCode(recipe.code);
        agent.setHistory(recipe.chat_history || []);
        // Run the recipe code against the current session/image
        const result = await execution.execute(sessionId, recipe.code, calibration);
        handleExecutionResult(result);
      } catch (err) {
        console.error('[App] handleLoadRecipe error:', err);
        agent.addSystemMessage(`Failed to load recipe: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
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
      onChat={handleChat}
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
      // Annotation props
      humanAnnotations={humanAnnotations}
      onAddAnnotation={handleAddAnnotation}
      onUndoAnnotation={handleUndoAnnotation}
      onClearAnnotations={handleClearAnnotations}
      activeTool={activeTool}
      onSetActiveTool={setActiveTool}
      // Multi-image props
      imageList={imageList}
      setImageList={setImageList}
      currentImageIndex={currentImageIndex}
      setCurrentImageIndex={setCurrentImageIndex}
      onSwitchImage={handleSwitchImage}
      isSwitchingImage={isSwitchingImage}
      canvasRef={canvasViewerRef}
      snapshotMode={snapshotMode}
      setSnapshotMode={setSnapshotMode}
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
