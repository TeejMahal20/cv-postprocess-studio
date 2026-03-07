import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import {
  Eye, EyeOff, ZoomIn, ZoomOut, Maximize2,
  MousePointer2, CircleDot, ArrowUpRight, Square, Type,
  Undo2, Trash2,
} from 'lucide-react';
import type { COCODataset, ExecuteResponse, HumanAnnotation, DrawingTool, ImageEntry } from '../../../shared/types';
import { getFileUrl } from '../api';
import { useCanvasOverlay, getCategoryColor } from '../hooks/useCanvasOverlay';
import { useHumanAnnotations } from '../hooks/useHumanAnnotations';
import ImageNavigator from './ImageNavigator';

export interface CanvasViewerHandle {
  captureSnapshot(includeBaseImage: boolean): string | null;
}

interface CanvasViewerProps {
  sessionId: string;
  imageFilename: string;
  imageWidth: number;
  imageHeight: number;
  cocoData: COCODataset | null;
  executionResult: ExecuteResponse | null;
  highlightedFeature: number | null;
  humanAnnotations: HumanAnnotation[];
  onAddAnnotation: (anno: HumanAnnotation) => void;
  onUndoAnnotation: () => void;
  onClearAnnotations: () => void;
  activeTool: DrawingTool;
  onSetActiveTool: (tool: DrawingTool) => void;
  imageList: ImageEntry[];
  currentImageIndex: number;
  onSwitchImage: (index: number) => void;
  isSwitchingImage: boolean;
}

interface LayerVisibility {
  base: boolean;
  annotations: boolean;
  results: boolean;
}

const TOOLS: { tool: DrawingTool; icon: typeof MousePointer2; label: string }[] = [
  { tool: 'pan', icon: MousePointer2, label: 'Pan' },
  { tool: 'point', icon: CircleDot, label: 'Point' },
  { tool: 'line', icon: ArrowUpRight, label: 'Line' },
  { tool: 'rect', icon: Square, label: 'Rect' },
  { tool: 'text', icon: Type, label: 'Text' },
];

const CanvasViewer = forwardRef<CanvasViewerHandle, CanvasViewerProps>(function CanvasViewer({
  sessionId,
  imageFilename,
  imageWidth,
  imageHeight,
  cocoData,
  executionResult,
  highlightedFeature: _highlightedFeature,
  humanAnnotations,
  onAddAnnotation,
  onUndoAnnotation,
  onClearAnnotations,
  activeTool,
  onSetActiveTool,
  imageList,
  currentImageIndex,
  onSwitchImage,
  isSwitchingImage,
}, ref) {
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const annoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const resultsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const humanAnnoCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [layers, setLayers] = useState<LayerVisibility>({
    base: true,
    annotations: true,
    results: true,
  });
  const [visibleCategories, setVisibleCategories] = useState<Set<number>>(
    new Set(),
  );
  const [imageLoaded, setImageLoaded] = useState(false);
  const [textValue, setTextValue] = useState('');
  const textInputRef = useRef<HTMLInputElement>(null);

  const { drawAnnotations, drawOverlays } = useCanvasOverlay();
  const humanAnno = useHumanAnnotations(activeTool, humanAnnotations, onAddAnnotation);

  // Expose captureSnapshot to parent via ref
  // Max dimension for Claude vision (keeps payload small + within API limits)
  const SNAPSHOT_MAX_DIM = 1568;

  useImperativeHandle(ref, () => ({
    captureSnapshot(includeBaseImage: boolean): string | null {
      if (!imageWidth || !imageHeight) return null;

      // Composite at full resolution first
      const full = document.createElement('canvas');
      full.width = imageWidth;
      full.height = imageHeight;
      const fctx = full.getContext('2d');
      if (!fctx) return null;

      if (includeBaseImage && baseCanvasRef.current) {
        fctx.drawImage(baseCanvasRef.current, 0, 0);
      } else {
        fctx.fillStyle = '#000000';
        fctx.fillRect(0, 0, imageWidth, imageHeight);
      }

      if (annoCanvasRef.current) {
        fctx.globalAlpha = 0.6;
        fctx.drawImage(annoCanvasRef.current, 0, 0);
        fctx.globalAlpha = 1.0;
      }
      if (resultsCanvasRef.current) {
        fctx.drawImage(resultsCanvasRef.current, 0, 0);
      }
      if (humanAnnoCanvasRef.current) {
        fctx.drawImage(humanAnnoCanvasRef.current, 0, 0);
      }

      // Downscale if needed to keep payload manageable
      const longest = Math.max(imageWidth, imageHeight);
      let outCanvas = full;
      if (longest > SNAPSHOT_MAX_DIM) {
        const scale = SNAPSHOT_MAX_DIM / longest;
        const outW = Math.round(imageWidth * scale);
        const outH = Math.round(imageHeight * scale);
        const scaled = document.createElement('canvas');
        scaled.width = outW;
        scaled.height = outH;
        const sctx = scaled.getContext('2d');
        if (sctx) {
          sctx.drawImage(full, 0, 0, outW, outH);
          outCanvas = scaled;
        }
      }

      // Encode as JPEG for much smaller payload (PNG base64 can be 20MB+)
      const dataUrl = outCanvas.toDataURL('image/jpeg', 0.8);
      return dataUrl.replace(/^data:image\/jpeg;base64,/, '');
    },
  }), [imageWidth, imageHeight]);

  // Initialize offscreen canvases
  useEffect(() => {
    baseCanvasRef.current = document.createElement('canvas');
    annoCanvasRef.current = document.createElement('canvas');
    resultsCanvasRef.current = document.createElement('canvas');
    humanAnnoCanvasRef.current = document.createElement('canvas');
    [baseCanvasRef, annoCanvasRef, resultsCanvasRef, humanAnnoCanvasRef].forEach((ref) => {
      if (ref.current) {
        ref.current.width = imageWidth;
        ref.current.height = imageHeight;
      }
    });
  }, [imageWidth, imageHeight]);

  // Initialize visible categories from COCO data
  useEffect(() => {
    if (cocoData) {
      setVisibleCategories(new Set(cocoData.categories.map((c) => c.id)));
    }
  }, [cocoData]);

  // Load base image
  useEffect(() => {
    const canvas = baseCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset so composite waits for the new image before rendering
    setImageLoaded(false);
    ctx.clearRect(0, 0, imageWidth, imageHeight);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.clearRect(0, 0, imageWidth, imageHeight);
      ctx.drawImage(img, 0, 0, imageWidth, imageHeight);
      setImageLoaded(true);
    };
    img.src = getFileUrl(sessionId, imageFilename);
  }, [sessionId, imageFilename, imageWidth, imageHeight]);

  // Draw COCO annotations
  useEffect(() => {
    if (!cocoData || !annoCanvasRef.current) return;
    const ctx = annoCanvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, imageWidth, imageHeight);
    drawAnnotations(ctx, cocoData, visibleCategories);
  }, [cocoData, visibleCategories, imageWidth, imageHeight, drawAnnotations]);

  // Draw result overlays
  useEffect(() => {
    if (!resultsCanvasRef.current) return;
    const ctx = resultsCanvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, imageWidth, imageHeight);

    if (executionResult?.success && executionResult.result?.overlays && executionResult.run_id) {
      drawOverlays(
        ctx,
        executionResult.result.overlays,
        sessionId,
        executionResult.run_id,
        () => composite(),
      );
    }
  }, [executionResult, sessionId, imageWidth, imageHeight, drawOverlays]);

  // Draw human annotations layer
  useEffect(() => {
    if (!humanAnnoCanvasRef.current) return;
    const ctx = humanAnnoCanvasRef.current.getContext('2d');
    if (!ctx) return;
    humanAnno.drawLayer(ctx);
    composite();
  }, [humanAnno.drawLayer]);

  // Composite all layers
  const composite = useCallback(() => {
    const main = mainCanvasRef.current;
    if (!main) return;
    const ctx = main.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, imageWidth, imageHeight);

    if (layers.base && baseCanvasRef.current) {
      ctx.drawImage(baseCanvasRef.current, 0, 0);
    }
    if (layers.annotations && annoCanvasRef.current) {
      ctx.globalAlpha = 0.6;
      ctx.drawImage(annoCanvasRef.current, 0, 0);
      ctx.globalAlpha = 1.0;
    }
    if (layers.results && resultsCanvasRef.current) {
      ctx.drawImage(resultsCanvasRef.current, 0, 0);
    }
    if (humanAnnoCanvasRef.current) {
      ctx.drawImage(humanAnnoCanvasRef.current, 0, 0);
    }
  }, [layers, imageWidth, imageHeight]);

  // Re-composite when layers toggle or content changes
  useEffect(() => {
    if (imageLoaded) composite();
  }, [imageLoaded, layers, composite, cocoData, executionResult, visibleCategories]);

  const toggleCategory = (catId: number) => {
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  // Mouse handlers for drawing on canvas
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (activeTool === 'pan') return;
      const imageX = e.nativeEvent.offsetX;
      const imageY = e.nativeEvent.offsetY;
      humanAnno.handleMouseDown(imageX, imageY, e.clientX, e.clientY);
    },
    [activeTool, humanAnno.handleMouseDown],
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (activeTool === 'pan') return;
      humanAnno.handleMouseMove(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    },
    [activeTool, humanAnno.handleMouseMove],
  );

  const handleCanvasMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (activeTool === 'pan') return;
      humanAnno.handleMouseUp(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    },
    [activeTool, humanAnno.handleMouseUp],
  );

  // Text input confirmation
  const handleTextConfirm = useCallback(() => {
    if (!humanAnno.textInput || !textValue.trim()) {
      humanAnno.setTextInput(null);
      setTextValue('');
      return;
    }
    onAddAnnotation({
      type: 'text',
      id: crypto.randomUUID(),
      x: humanAnno.textInput.x,
      y: humanAnno.textInput.y,
      text: textValue.trim(),
    });
    humanAnno.setTextInput(null);
    setTextValue('');
  }, [humanAnno.textInput, textValue, onAddAnnotation, humanAnno.setTextInput]);

  // Focus text input when it appears
  useEffect(() => {
    if (humanAnno.textInput) {
      setTextValue('');
      setTimeout(() => textInputRef.current?.focus(), 0);
    }
  }, [humanAnno.textInput]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700 bg-gray-800 text-xs shrink-0 flex-wrap">
        {/* Image navigation */}
        <ImageNavigator
          imageList={imageList}
          currentIndex={currentImageIndex}
          onSwitch={onSwitchImage}
          isSwitching={isSwitchingImage}
        />
        {imageList.length > 1 && <div className="w-px h-4 bg-gray-600" />}

        {/* Layer toggles */}
        {(['base', 'annotations', 'results'] as const).map((layer) => (
          <button
            key={layer}
            onClick={() => setLayers((p) => ({ ...p, [layer]: !p[layer] }))}
            className={`flex items-center gap-1 px-2 py-1 rounded ${
              layers[layer]
                ? 'bg-gray-700 text-gray-200'
                : 'bg-gray-800 text-gray-500'
            }`}
          >
            {layers[layer] ? (
              <Eye className="w-3 h-3" />
            ) : (
              <EyeOff className="w-3 h-3" />
            )}
            {layer}
          </button>
        ))}

        <div className="w-px h-4 bg-gray-600" />

        {/* Drawing tools */}
        {TOOLS.map(({ tool, icon: Icon, label }) => (
          <button
            key={tool}
            onClick={() => onSetActiveTool(tool)}
            title={label}
            className={`flex items-center gap-1 px-2 py-1 rounded ${
              activeTool === tool
                ? 'bg-orange-600/30 text-orange-400 ring-1 ring-orange-500/50'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}

        <div className="w-px h-4 bg-gray-600" />

        {/* Undo / Clear */}
        <button
          onClick={onUndoAnnotation}
          disabled={humanAnnotations.length === 0}
          title="Undo last annotation"
          className="flex items-center gap-1 px-2 py-1 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Undo2 className="w-3 h-3" />
        </button>
        <button
          onClick={onClearAnnotations}
          disabled={humanAnnotations.length === 0}
          title="Clear all annotations"
          className="flex items-center gap-1 px-2 py-1 rounded text-gray-500 hover:text-red-400 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-3 h-3" />
        </button>

        {humanAnnotations.length > 0 && (
          <span className="text-gray-500 ml-1">
            {humanAnnotations.length} annotation{humanAnnotations.length !== 1 ? 's' : ''}
          </span>
        )}

        <div className="w-px h-4 bg-gray-600" />

        {/* Category legend */}
        {cocoData?.categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => toggleCategory(cat.id)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
              visibleCategories.has(cat.id)
                ? 'text-gray-200'
                : 'text-gray-600 line-through'
            }`}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: getCategoryColor(cat.id) }}
            />
            {cat.name}
          </button>
        ))}
      </div>

      {/* Canvas with zoom/pan */}
      <div className="flex-1 overflow-hidden bg-gray-950 relative">
        <TransformWrapper
          initialScale={1}
          minScale={0.1}
          maxScale={10}
          centerOnInit
          panning={{ disabled: activeTool !== 'pan' }}
        >
          {({ zoomIn, zoomOut, resetTransform }) => (
            <>
              {/* Zoom controls */}
              <div className="absolute top-2 right-2 z-10 flex gap-1">
                <button
                  onClick={() => zoomIn()}
                  className="p-1 bg-gray-800/80 rounded hover:bg-gray-700"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => zoomOut()}
                  className="p-1 bg-gray-800/80 rounded hover:bg-gray-700"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={() => resetTransform()}
                  className="p-1 bg-gray-800/80 rounded hover:bg-gray-700"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
              <TransformComponent
                wrapperStyle={{ width: '100%', height: '100%' }}
              >
                <canvas
                  ref={mainCanvasRef}
                  width={imageWidth}
                  height={imageHeight}
                  className="max-w-none"
                  style={{ cursor: activeTool === 'pan' ? 'grab' : 'crosshair' }}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                />
              </TransformComponent>
            </>
          )}
        </TransformWrapper>

        {/* Floating text input for text tool */}
        {humanAnno.textInput && (
          <div
            className="absolute z-20"
            style={{
              left: humanAnno.textInput.screenX,
              top: humanAnno.textInput.screenY,
            }}
          >
            <input
              ref={textInputRef}
              type="text"
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTextConfirm();
                if (e.key === 'Escape') {
                  humanAnno.setTextInput(null);
                  setTextValue('');
                }
              }}
              onBlur={handleTextConfirm}
              placeholder="Type label..."
              className="px-2 py-1 text-sm bg-gray-900 border border-orange-500 text-orange-300 rounded outline-none min-w-[120px]"
            />
          </div>
        )}
      </div>
    </div>
  );
});

export default CanvasViewer;
