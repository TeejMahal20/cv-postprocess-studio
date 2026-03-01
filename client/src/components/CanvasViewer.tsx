import { useRef, useEffect, useState, useCallback } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Eye, EyeOff, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import type { COCODataset, ExecuteResponse } from '../../../shared/types';
import { getFileUrl } from '../api';
import { useCanvasOverlay, getCategoryColor } from '../hooks/useCanvasOverlay';

interface CanvasViewerProps {
  sessionId: string;
  imageFilename: string;
  imageWidth: number;
  imageHeight: number;
  cocoData: COCODataset | null;
  executionResult: ExecuteResponse | null;
  highlightedFeature: number | null;
}

interface LayerVisibility {
  base: boolean;
  annotations: boolean;
  results: boolean;
}

export default function CanvasViewer({
  sessionId,
  imageFilename,
  imageWidth,
  imageHeight,
  cocoData,
  executionResult,
  highlightedFeature: _highlightedFeature,
}: CanvasViewerProps) {
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const annoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const resultsCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [layers, setLayers] = useState<LayerVisibility>({
    base: true,
    annotations: true,
    results: true,
  });
  const [visibleCategories, setVisibleCategories] = useState<Set<number>>(
    new Set(),
  );
  const [imageLoaded, setImageLoaded] = useState(false);

  const { drawAnnotations, drawOverlays } = useCanvasOverlay();

  // Initialize offscreen canvases
  useEffect(() => {
    baseCanvasRef.current = document.createElement('canvas');
    annoCanvasRef.current = document.createElement('canvas');
    resultsCanvasRef.current = document.createElement('canvas');
    [baseCanvasRef, annoCanvasRef, resultsCanvasRef].forEach((ref) => {
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

    if (executionResult?.success && executionResult.result?.overlays) {
      drawOverlays(
        ctx,
        executionResult.result.overlays,
        sessionId,
        executionResult.run_id,
        () => composite(), // re-composite when async mask loads
      );
    }
  }, [executionResult, sessionId, imageWidth, imageHeight, drawOverlays]);

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

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-700 bg-gray-800 text-xs shrink-0 flex-wrap">
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
      <div className="flex-1 overflow-hidden bg-gray-950">
        <TransformWrapper
          initialScale={1}
          minScale={0.1}
          maxScale={10}
          centerOnInit
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
                />
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      </div>
    </div>
  );
}
