import { useState, useCallback, useRef } from 'react';
import type {
  HumanAnnotation,
  DrawingTool,
} from '../../../shared/types';

const HUMAN_COLOR = '#FF6B35';

interface DrawingState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export interface TextInputState {
  x: number; // image-space
  y: number;
  screenX: number; // screen-space for positioning the input
  screenY: number;
}

export function useHumanAnnotations(
  activeTool: DrawingTool,
  annotations: HumanAnnotation[],
  onAddAnnotation: (anno: HumanAnnotation) => void,
) {
  const [drawingState, setDrawingState] = useState<DrawingState | null>(null);
  const [textInput, setTextInput] = useState<TextInputState | null>(null);
  const drawingStateRef = useRef<DrawingState | null>(null);

  const handleMouseDown = useCallback(
    (imageX: number, imageY: number, screenX: number, screenY: number) => {
      if (activeTool === 'pan') return;

      if (activeTool === 'point') {
        onAddAnnotation({
          type: 'point',
          id: crypto.randomUUID(),
          x: Math.round(imageX),
          y: Math.round(imageY),
        });
        return;
      }

      if (activeTool === 'text') {
        setTextInput({ x: Math.round(imageX), y: Math.round(imageY), screenX, screenY });
        return;
      }

      // Line or Rect — start rubber-band
      const state: DrawingState = {
        startX: imageX,
        startY: imageY,
        currentX: imageX,
        currentY: imageY,
      };
      setDrawingState(state);
      drawingStateRef.current = state;
    },
    [activeTool, onAddAnnotation],
  );

  const handleMouseMove = useCallback(
    (imageX: number, imageY: number) => {
      if (!drawingStateRef.current) return;
      const updated = { ...drawingStateRef.current, currentX: imageX, currentY: imageY };
      drawingStateRef.current = updated;
      setDrawingState(updated);
    },
    [],
  );

  const handleMouseUp = useCallback(
    (imageX: number, imageY: number) => {
      const ds = drawingStateRef.current;
      if (!ds) return;

      const dx = imageX - ds.startX;
      const dy = imageY - ds.startY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Ignore tiny drags (accidental clicks)
      if (dist < 3) {
        setDrawingState(null);
        drawingStateRef.current = null;
        return;
      }

      if (activeTool === 'line') {
        onAddAnnotation({
          type: 'line',
          id: crypto.randomUUID(),
          start: [Math.round(ds.startX), Math.round(ds.startY)],
          end: [Math.round(imageX), Math.round(imageY)],
        });
      } else if (activeTool === 'rect') {
        const x = Math.round(Math.min(ds.startX, imageX));
        const y = Math.round(Math.min(ds.startY, imageY));
        const w = Math.round(Math.abs(imageX - ds.startX));
        const h = Math.round(Math.abs(imageY - ds.startY));
        onAddAnnotation({
          type: 'rect',
          id: crypto.randomUUID(),
          x, y, width: w, height: h,
        });
      }

      setDrawingState(null);
      drawingStateRef.current = null;
    },
    [activeTool, onAddAnnotation],
  );

  const drawLayer = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      drawHumanAnnotations(ctx, annotations, drawingState, activeTool);
    },
    [annotations, drawingState, activeTool],
  );

  return { handleMouseDown, handleMouseMove, handleMouseUp, drawLayer, textInput, setTextInput };
}

// --- Rendering ---

function drawHumanAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: HumanAnnotation[],
  inProgress: DrawingState | null,
  activeTool: DrawingTool,
) {
  ctx.save();

  for (const anno of annotations) {
    switch (anno.type) {
      case 'point':
        drawPoint(ctx, anno.x, anno.y, anno.label);
        break;
      case 'line':
        drawLine(ctx, anno.start[0], anno.start[1], anno.end[0], anno.end[1], anno.label);
        break;
      case 'rect':
        drawRect(ctx, anno.x, anno.y, anno.width, anno.height, anno.label);
        break;
      case 'text':
        drawText(ctx, anno.x, anno.y, anno.text);
        break;
    }
  }

  // Draw in-progress rubber-band
  if (inProgress) {
    ctx.globalAlpha = 0.6;
    if (activeTool === 'line') {
      drawLine(ctx, inProgress.startX, inProgress.startY, inProgress.currentX, inProgress.currentY);
    } else if (activeTool === 'rect') {
      const x = Math.min(inProgress.startX, inProgress.currentX);
      const y = Math.min(inProgress.startY, inProgress.currentY);
      const w = Math.abs(inProgress.currentX - inProgress.startX);
      const h = Math.abs(inProgress.currentY - inProgress.startY);
      drawRect(ctx, x, y, w, h);
    }
    ctx.globalAlpha = 1.0;
  }

  ctx.restore();
}

function drawPoint(ctx: CanvasRenderingContext2D, x: number, y: number, label?: string) {
  // Filled dot
  ctx.fillStyle = HUMAN_COLOR;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();

  // Crosshair
  ctx.strokeStyle = HUMAN_COLOR;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 12, y);
  ctx.lineTo(x + 12, y);
  ctx.moveTo(x, y - 12);
  ctx.lineTo(x, y + 12);
  ctx.stroke();

  if (label) {
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = HUMAN_COLOR;
    ctx.fillText(label, x + 10, y - 10);
  }
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  label?: string,
) {
  // Dashed line
  ctx.strokeStyle = HUMAN_COLOR;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 3]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrow heads at both ends
  drawArrowHead(ctx, x1, y1, x2, y2);
  drawArrowHead(ctx, x2, y2, x1, y1);

  // Length label at midpoint
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2 - 8;
  const text = label || `${length.toFixed(0)} px`;

  ctx.font = 'bold 11px monospace';
  const metrics = ctx.measureText(text);
  ctx.fillStyle = '#000000CC';
  ctx.fillRect(midX - metrics.width / 2 - 3, midY - 10, metrics.width + 6, 15);
  ctx.fillStyle = HUMAN_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, midX, midY - 2);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  fromX: number, fromY: number,
  toX: number, toY: number,
) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const size = 8;
  ctx.fillStyle = HUMAN_COLOR;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(
    fromX + size * Math.cos(angle - Math.PI / 6),
    fromY + size * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    fromX + size * Math.cos(angle + Math.PI / 6),
    fromY + size * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  label?: string,
) {
  ctx.strokeStyle = HUMAN_COLOR;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  // Light fill
  ctx.fillStyle = HUMAN_COLOR + '15';
  ctx.fillRect(x, y, w, h);

  if (label) {
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = HUMAN_COLOR;
    ctx.fillText(label, x + 4, y - 4);
  }
}

function drawText(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
  ctx.font = 'bold 14px sans-serif';

  // Background
  const metrics = ctx.measureText(text);
  ctx.fillStyle = '#000000AA';
  ctx.fillRect(x - 2, y - 14, metrics.width + 4, 18);

  // Text
  ctx.fillStyle = HUMAN_COLOR;
  ctx.textBaseline = 'top';
  ctx.fillText(text, x, y - 12);
  ctx.textBaseline = 'alphabetic';
}
