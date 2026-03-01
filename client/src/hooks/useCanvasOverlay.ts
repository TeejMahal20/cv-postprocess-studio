import { useCallback } from 'react';
import type {
  COCODataset,
  COCOAnnotation,
  ResultOverlay,
  MeasurementOverlay,
  BboxOverlay,
  ContourOverlay,
  TextOverlay,
  MaskOverlay,
} from '../../../shared/types';
import { getOutputUrl } from '../api';

// 12 distinct colors for annotation categories
const PALETTE = [
  '#3B82F6', '#EF4444', '#22C55E', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#14B8A6', '#A855F7',
  '#E11D48', '#84CC16',
];

export function getCategoryColor(categoryId: number): string {
  return PALETTE[categoryId % PALETTE.length];
}

export function drawCOCOAnnotations(
  ctx: CanvasRenderingContext2D,
  coco: COCODataset,
  visibleCategories: Set<number>,
) {
  for (const ann of coco.annotations) {
    if (!visibleCategories.has(ann.category_id)) continue;
    const color = getCategoryColor(ann.category_id);

    // Draw polygon segmentation
    if (Array.isArray(ann.segmentation)) {
      drawPolygonSegmentation(ctx, ann.segmentation, color);
    }

    // Draw bbox
    if (ann.bbox) {
      drawBbox(ctx, ann, color, coco);
    }
  }
}

function drawPolygonSegmentation(
  ctx: CanvasRenderingContext2D,
  segmentation: number[][],
  color: string,
) {
  ctx.save();
  for (const polygon of segmentation) {
    if (polygon.length < 6) continue; // Need at least 3 points
    ctx.beginPath();
    ctx.moveTo(polygon[0], polygon[1]);
    for (let i = 2; i < polygon.length; i += 2) {
      ctx.lineTo(polygon[i], polygon[i + 1]);
    }
    ctx.closePath();
    ctx.fillStyle = color + '40'; // 25% opacity
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

function drawBbox(
  ctx: CanvasRenderingContext2D,
  ann: COCOAnnotation,
  color: string,
  coco: COCODataset,
) {
  const [x, y, w, h] = ann.bbox;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  // Label
  const cat = coco.categories.find((c) => c.id === ann.category_id);
  const label = cat?.name || `cat_${ann.category_id}`;
  const scoreText = ann.score !== undefined ? ` ${(ann.score * 100).toFixed(0)}%` : '';
  const text = `${label}${scoreText}`;

  ctx.font = '11px sans-serif';
  const metrics = ctx.measureText(text);
  const padding = 3;
  ctx.fillStyle = color;
  ctx.fillRect(x, y - 16, metrics.width + padding * 2, 16);
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'top';
  ctx.fillText(text, x + padding, y - 14);
  ctx.restore();
}

// --- Result overlay drawing (Phase 8 will extend these) ---

export function drawResultOverlays(
  ctx: CanvasRenderingContext2D,
  overlays: ResultOverlay[],
  sessionId: string,
  runId: string,
  onMaskLoaded?: () => void,
) {
  for (const overlay of overlays) {
    switch (overlay.type) {
      case 'measurements':
        drawMeasurements(ctx, overlay);
        break;
      case 'bboxes':
        drawOverlayBboxes(ctx, overlay);
        break;
      case 'contours':
        drawContours(ctx, overlay);
        break;
      case 'text':
        drawTextOverlay(ctx, overlay);
        break;
      case 'mask':
        drawMaskOverlay(ctx, overlay, sessionId, runId, onMaskLoaded);
        break;
    }
  }
}

function drawMeasurements(
  ctx: CanvasRenderingContext2D,
  overlay: MeasurementOverlay,
) {
  ctx.save();
  for (const line of overlay.lines) {
    const { start, end, value, color } = line;

    // Dashed measurement line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(start[0], start[1]);
    ctx.lineTo(end[0], end[1]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrow heads
    drawArrowHead(ctx, start, end, color);
    drawArrowHead(ctx, end, start, color);

    // Label centered above line
    const midX = (start[0] + end[0]) / 2;
    const midY = (start[1] + end[1]) / 2 - 8;
    ctx.fillStyle = '#000000CC';
    ctx.font = 'bold 11px monospace';
    const metrics = ctx.measureText(value);
    ctx.fillRect(midX - metrics.width / 2 - 3, midY - 10, metrics.width + 6, 15);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(value, midX, midY - 2);
  }
  ctx.restore();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  from: [number, number],
  to: [number, number],
  color: string,
) {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const size = 8;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(
    from[0] + size * Math.cos(angle - Math.PI / 6),
    from[1] + size * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    from[0] + size * Math.cos(angle + Math.PI / 6),
    from[1] + size * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawOverlayBboxes(
  ctx: CanvasRenderingContext2D,
  overlay: BboxOverlay,
) {
  ctx.save();
  for (const box of overlay.boxes) {
    ctx.strokeStyle = box.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    if (box.label) {
      ctx.font = '11px sans-serif';
      const metrics = ctx.measureText(box.label);
      ctx.fillStyle = box.color;
      ctx.fillRect(box.x, box.y - 16, metrics.width + 6, 16);
      ctx.fillStyle = '#FFFFFF';
      ctx.textBaseline = 'top';
      ctx.fillText(box.label, box.x + 3, box.y - 14);
    }
  }
  ctx.restore();
}

function drawContours(
  ctx: CanvasRenderingContext2D,
  overlay: ContourOverlay,
) {
  if (overlay.points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = overlay.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(overlay.points[0][0], overlay.points[0][1]);
  for (let i = 1; i < overlay.points.length; i++) {
    ctx.lineTo(overlay.points[i][0], overlay.points[i][1]);
  }
  ctx.closePath();
  ctx.stroke();

  if (overlay.label) {
    const cx = overlay.points.reduce((s, p) => s + p[0], 0) / overlay.points.length;
    const cy = overlay.points.reduce((s, p) => s + p[1], 0) / overlay.points.length;
    ctx.fillStyle = overlay.color;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(overlay.label, cx, cy);
  }
  ctx.restore();
}

function drawTextOverlay(ctx: CanvasRenderingContext2D, overlay: TextOverlay) {
  ctx.save();
  for (const entry of overlay.entries) {
    ctx.fillStyle = entry.color;
    ctx.font = `${entry.size || 12}px sans-serif`;
    ctx.fillText(entry.text, entry.x, entry.y);
  }
  ctx.restore();
}

function drawMaskOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: MaskOverlay,
  sessionId: string,
  runId: string,
  onLoaded?: () => void,
) {
  if (!overlay.filename) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    ctx.save();
    ctx.globalAlpha = overlay.opacity;
    ctx.drawImage(img, 0, 0);
    ctx.globalAlpha = 1.0;
    ctx.restore();
    onLoaded?.();
  };
  img.src = getOutputUrl(sessionId, runId, overlay.filename);
}

export function useCanvasOverlay() {
  const drawAnnotations = useCallback(
    (ctx: CanvasRenderingContext2D, coco: COCODataset, visible: Set<number>) => {
      drawCOCOAnnotations(ctx, coco, visible);
    },
    [],
  );

  const drawOverlays = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      overlays: ResultOverlay[],
      sessionId: string,
      runId: string,
      onMaskLoaded?: () => void,
    ) => {
      drawResultOverlays(ctx, overlays, sessionId, runId, onMaskLoaded);
    },
    [],
  );

  return { drawAnnotations, drawOverlays, getCategoryColor };
}
