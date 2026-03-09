import type { RefObject } from 'react';
import type {
  UploadResponse,
  COCODataset,
  CalibrationConfig,
  ExecuteResponse,
  RecipeListItem,
  HumanAnnotation,
  DrawingTool,
  ImageEntry,
} from '../../../shared/types';
import type { ChatMessage } from '../types';
import UploadPanel from './UploadPanel';
import CalibrationSettings from './CalibrationSettings';
import CanvasViewer from './CanvasViewer';
import type { CanvasViewerHandle } from './CanvasViewer';
import AgentPanel from './AgentPanel';
import CTQResultsTable from './CTQResultsTable';

interface LayoutProps {
  sessionId: string | null;
  setSessionId: (id: string) => void;
  uploadResult: UploadResponse | null;
  setUploadResult: (r: UploadResponse) => void;
  cocoData: COCODataset | null;
  setCocoData: (d: COCODataset) => void;
  calibration: CalibrationConfig;
  setCalibration: (c: CalibrationConfig) => void;
  code: string;
  setCode: (c: string) => void;
  executionResult: ExecuteResponse | null;
  setExecutionResult: (r: ExecuteResponse | null) => void;
  highlightedFeature: number | null;
  setHighlightedFeature: (id: number | null) => void;
  // Agent props
  isGenerating: boolean;
  isExecuting: boolean;
  chatHistory: ChatMessage[];
  onGenerate: (prompt: string) => Promise<void>;
  onGenerateAndRun: (prompt: string) => Promise<void>;
  onChat: (prompt: string) => Promise<void>;
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
  // Annotation props
  humanAnnotations: HumanAnnotation[];
  onAddAnnotation: (anno: HumanAnnotation) => void;
  onUndoAnnotation: () => void;
  onClearAnnotations: () => void;
  activeTool: DrawingTool;
  onSetActiveTool: (tool: DrawingTool) => void;
  // Multi-image props
  imageList: ImageEntry[];
  setImageList: (list: ImageEntry[]) => void;
  currentImageIndex: number;
  setCurrentImageIndex: (index: number) => void;
  onSwitchImage: (index: number) => void;
  isSwitchingImage: boolean;
  // Canvas ref for snapshot capture
  canvasRef: RefObject<CanvasViewerHandle>;
  // Snapshot mode toggle
  snapshotMode: 'annotations' | 'full';
  setSnapshotMode: (mode: 'annotations' | 'full') => void;
  // Thinking mode toggle
  thinkingMode: 'auto' | 'on' | 'off';
  setThinkingMode: (mode: 'auto' | 'on' | 'off') => void;
}

export default function Layout({
  sessionId,
  setSessionId,
  uploadResult,
  setUploadResult,
  cocoData,
  setCocoData,
  calibration,
  setCalibration,
  code,
  setCode,
  executionResult,
  setExecutionResult: _setExecutionResult,
  highlightedFeature,
  setHighlightedFeature,
  isGenerating,
  isExecuting,
  chatHistory,
  onGenerate,
  onGenerateAndRun,
  onChat,
  onRun,
  onClearHistory,
  recipes,
  recipesLoading,
  onSaveRecipe,
  onLoadRecipe,
  onDeleteRecipe,
  onDownloadRecipe,
  onPromoteRecipe,
  humanAnnotations,
  onAddAnnotation,
  onUndoAnnotation,
  onClearAnnotations,
  activeTool,
  onSetActiveTool,
  imageList,
  setImageList,
  currentImageIndex,
  setCurrentImageIndex,
  onSwitchImage,
  isSwitchingImage,
  canvasRef,
  snapshotMode,
  setSnapshotMode,
  thinkingMode,
  setThinkingMode,
}: LayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
      <header className="h-12 bg-gray-800 border-b border-gray-700 flex items-center px-4 shrink-0">
        <h1 className="text-lg font-semibold">CV PostProcess Studio</h1>
        {sessionId && (
          <span className="ml-auto text-xs text-gray-400">
            Session: {sessionId.slice(0, 8)}...
          </span>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left panel: Upload + Calibration */}
        <aside className="w-[300px] bg-gray-850 border-r border-gray-700 overflow-y-auto p-4">
          <UploadPanel
            sessionId={sessionId}
            setSessionId={setSessionId}
            uploadResult={uploadResult}
            setUploadResult={setUploadResult}
            setCocoData={setCocoData}
            setImageList={setImageList}
            setCurrentImageIndex={setCurrentImageIndex}
          />
          <CalibrationSettings
            calibration={calibration}
            setCalibration={setCalibration}
          />
        </aside>

        {/* Center panel: Canvas + Results */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {uploadResult && sessionId ? (
            <>
              <CanvasViewer
                ref={canvasRef}
                sessionId={sessionId}
                imageFilename={uploadResult.image.filename}
                imageWidth={uploadResult.image.width}
                imageHeight={uploadResult.image.height}
                cocoData={cocoData}
                executionResult={executionResult}
                highlightedFeature={highlightedFeature}
                humanAnnotations={humanAnnotations}
                onAddAnnotation={onAddAnnotation}
                onUndoAnnotation={onUndoAnnotation}
                onClearAnnotations={onClearAnnotations}
                activeTool={activeTool}
                onSetActiveTool={onSetActiveTool}
                imageList={imageList}
                currentImageIndex={currentImageIndex}
                onSwitchImage={onSwitchImage}
                isSwitchingImage={isSwitchingImage}
              />
              {/* Bottom results area */}
              {executionResult?.success && executionResult.result && (
                <div className="shrink-0 max-h-[40%] overflow-y-auto border-t border-gray-700 p-3 space-y-3">
                  {executionResult.result.ctq_results?.length > 0 && (
                    <CTQResultsTable
                      results={executionResult.result.ctq_results}
                      onHighlightFeature={setHighlightedFeature}
                    />
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-600">
              <div className="text-center">
                <p className="text-lg">
                  Upload an image and COCO JSON to begin
                </p>
                <p className="text-sm mt-1">
                  Drag and drop files into the left panel, or upload a COCO folder
                </p>
              </div>
            </div>
          )}
        </main>

        {/* Right panel: Agent + Code (1/3 of viewport) */}
        <aside className="w-1/3 bg-gray-850 border-l border-gray-700 overflow-y-auto p-4">
          {sessionId && uploadResult ? (
            <AgentPanel
              sessionId={sessionId}
              uploadResult={uploadResult}
              calibration={calibration}
              code={code}
              setCode={setCode}
              executionResult={executionResult}
              isGenerating={isGenerating}
              isExecuting={isExecuting}
              chatHistory={chatHistory}
              onGenerate={onGenerate}
              onGenerateAndRun={onGenerateAndRun}
              onChat={onChat}
              onRun={onRun}
              onClearHistory={onClearHistory}
              recipes={recipes}
              recipesLoading={recipesLoading}
              onSaveRecipe={onSaveRecipe}
              onLoadRecipe={onLoadRecipe}
              onDeleteRecipe={onDeleteRecipe}
              onDownloadRecipe={onDownloadRecipe}
              onPromoteRecipe={onPromoteRecipe}
              snapshotMode={snapshotMode}
              setSnapshotMode={setSnapshotMode}
              thinkingMode={thinkingMode}
              setThinkingMode={setThinkingMode}
            />
          ) : (
            <p className="text-sm text-gray-600">
              Upload files to enable the agent
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
