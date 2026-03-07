import type { HumanAnnotation, COCODataset, COCOAnnotation, COCOCategory } from '../../../shared/types.js';

interface FeatureRef {
  annotation_id: number;
  category_name: string;
  distance: number;
}

// --- Geometry utilities ---

function bboxCenter(bbox: [number, number, number, number]): [number, number] {
  return [bbox[0] + bbox[2] / 2, bbox[1] + bbox[3] / 2];
}

function pointDistance(
  p1: [number, number],
  p2: [number, number],
): number {
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function bboxContainsPoint(
  bbox: [number, number, number, number],
  point: [number, number],
): boolean {
  const [bx, by, bw, bh] = bbox;
  return (
    point[0] >= bx &&
    point[0] <= bx + bw &&
    point[1] >= by &&
    point[1] <= by + bh
  );
}

/**
 * Cohen-Sutherland style line-rectangle intersection test.
 */
function lineIntersectsBbox(
  start: [number, number],
  end: [number, number],
  bbox: [number, number, number, number],
): boolean {
  const [bx, by, bw, bh] = bbox;
  const xmin = bx;
  const xmax = bx + bw;
  const ymin = by;
  const ymax = by + bh;

  // Check if either endpoint is inside
  if (bboxContainsPoint(bbox, start) || bboxContainsPoint(bbox, end)) {
    return true;
  }

  // Check intersection with each edge
  return (
    lineSegmentsIntersect(start, end, [xmin, ymin], [xmax, ymin]) || // top
    lineSegmentsIntersect(start, end, [xmax, ymin], [xmax, ymax]) || // right
    lineSegmentsIntersect(start, end, [xmin, ymax], [xmax, ymax]) || // bottom
    lineSegmentsIntersect(start, end, [xmin, ymin], [xmin, ymax])    // left
  );
}

function lineSegmentsIntersect(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  p4: [number, number],
): boolean {
  const d1 = direction(p3, p4, p1);
  const d2 = direction(p3, p4, p2);
  const d3 = direction(p1, p2, p3);
  const d4 = direction(p1, p2, p4);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  if (d1 === 0 && onSegment(p3, p4, p1)) return true;
  if (d2 === 0 && onSegment(p3, p4, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, p3)) return true;
  if (d4 === 0 && onSegment(p1, p2, p4)) return true;

  return false;
}

function direction(
  pi: [number, number],
  pj: [number, number],
  pk: [number, number],
): number {
  return (pk[0] - pi[0]) * (pj[1] - pi[1]) - (pj[0] - pi[0]) * (pk[1] - pi[1]);
}

function onSegment(
  pi: [number, number],
  pj: [number, number],
  pk: [number, number],
): boolean {
  return (
    Math.min(pi[0], pj[0]) <= pk[0] &&
    pk[0] <= Math.max(pi[0], pj[0]) &&
    Math.min(pi[1], pj[1]) <= pk[1] &&
    pk[1] <= Math.max(pi[1], pj[1])
  );
}

function bboxesOverlap(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  return !(
    a[0] + a[2] < b[0] ||
    b[0] + b[2] < a[0] ||
    a[1] + a[3] < b[1] ||
    b[1] + b[3] < a[1]
  );
}

// --- Feature lookup helpers ---

function getCategoryName(
  categoryId: number,
  categories: COCOCategory[],
): string {
  const cat = categories.find((c) => c.id === categoryId);
  return cat?.name || `category_${categoryId}`;
}

function findNearestFeatures(
  point: [number, number],
  annotations: COCOAnnotation[],
  categories: COCOCategory[],
  topK = 3,
): FeatureRef[] {
  const refs: FeatureRef[] = annotations.map((ann) => ({
    annotation_id: ann.id,
    category_name: getCategoryName(ann.category_id, categories),
    distance: pointDistance(point, bboxCenter(ann.bbox)),
  }));

  refs.sort((a, b) => a.distance - b.distance);
  return refs.slice(0, topK);
}

function findLineCrossings(
  start: [number, number],
  end: [number, number],
  annotations: COCOAnnotation[],
  categories: COCOCategory[],
): { crossing: FeatureRef[]; above: FeatureRef[]; below: FeatureRef[] } {
  const crossing: FeatureRef[] = [];
  const above: FeatureRef[] = [];
  const below: FeatureRef[] = [];

  // Line direction vector for above/below classification
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];

  for (const ann of annotations) {
    const center = bboxCenter(ann.bbox);
    const ref: FeatureRef = {
      annotation_id: ann.id,
      category_name: getCategoryName(ann.category_id, categories),
      distance: 0,
    };

    if (lineIntersectsBbox(start, end, ann.bbox)) {
      crossing.push(ref);
    } else {
      // Cross product to determine which side of the line the center is on
      const cross = dx * (center[1] - start[1]) - dy * (center[0] - start[0]);
      if (cross < 0) {
        above.push(ref);
      } else {
        below.push(ref);
      }
    }
  }

  return { crossing, above, below };
}

function findRectOverlaps(
  rect: [number, number, number, number],
  annotations: COCOAnnotation[],
  categories: COCOCategory[],
): FeatureRef[] {
  const overlapping: FeatureRef[] = [];
  for (const ann of annotations) {
    if (bboxesOverlap(rect, ann.bbox)) {
      overlapping.push({
        annotation_id: ann.id,
        category_name: getCategoryName(ann.category_id, categories),
        distance: 0,
      });
    }
  }
  return overlapping;
}

// --- Main enrichment function ---

function formatFeatureList(refs: FeatureRef[], includeDistance = false): string {
  return refs
    .map((r) => {
      let s = `ann_${r.annotation_id} (${r.category_name})`;
      if (includeDistance) s += ` ${r.distance.toFixed(0)}px away`;
      return s;
    })
    .join(', ');
}

export function enrichAnnotationsWithContext(
  humanAnnotations: HumanAnnotation[],
  cocoData: COCODataset,
): string {
  if (!humanAnnotations?.length) return '';

  const annotations = cocoData.annotations || [];
  const categories = cocoData.categories || [];

  if (annotations.length === 0) {
    // No COCO annotations to cross-reference — fall back to coordinates only
    return '';
  }

  let section = `\n## Human Annotations — Spatial Context\nThe following describes how each user annotation relates to COCO features:\n\n`;

  for (const anno of humanAnnotations) {
    switch (anno.type) {
      case 'point': {
        const nearest = findNearestFeatures(
          [anno.x, anno.y],
          annotations,
          categories,
        );
        section += `- **Point** at (${anno.x}, ${anno.y})`;
        if (anno.label) section += ` — label: "${anno.label}"`;
        if (nearest.length > 0) {
          const inside = annotations.filter((a) =>
            bboxContainsPoint(a.bbox, [anno.x, anno.y]),
          );
          if (inside.length > 0) {
            const names = inside.map(
              (a) => `ann_${a.id} (${getCategoryName(a.category_id, categories)})`,
            );
            section += `\n  Inside: ${names.join(', ')}`;
          }
          section += `\n  Nearest: ${formatFeatureList(nearest, true)}`;
        }
        section += '\n';
        break;
      }
      case 'line': {
        const dx = anno.end[0] - anno.start[0];
        const dy = anno.end[1] - anno.start[1];
        const length = Math.sqrt(dx * dx + dy * dy);
        section += `- **Line** from (${anno.start[0]}, ${anno.start[1]}) to (${anno.end[0]}, ${anno.end[1]}) — length: ${length.toFixed(1)} px`;
        if (anno.label) section += `, label: "${anno.label}"`;

        const { crossing, above, below } = findLineCrossings(
          anno.start as [number, number],
          anno.end as [number, number],
          annotations,
          categories,
        );
        if (crossing.length > 0) {
          section += `\n  Crosses: ${formatFeatureList(crossing)}`;
        }
        if (above.length > 0 && above.length <= 5) {
          section += `\n  Above/left of line: ${formatFeatureList(above)}`;
        }
        if (below.length > 0 && below.length <= 5) {
          section += `\n  Below/right of line: ${formatFeatureList(below)}`;
        }
        section += '\n';
        break;
      }
      case 'rect': {
        section += `- **Rectangle** at (${anno.x}, ${anno.y}), size ${anno.width}x${anno.height} px`;
        if (anno.label) section += ` — label: "${anno.label}"`;

        const overlaps = findRectOverlaps(
          [anno.x, anno.y, anno.width, anno.height],
          annotations,
          categories,
        );
        if (overlaps.length > 0) {
          section += `\n  Contains/overlaps: ${formatFeatureList(overlaps)}`;
        } else {
          section += `\n  No COCO annotations overlap this region`;
        }
        section += '\n';
        break;
      }
      case 'text': {
        section += `- **Text note** at (${anno.x}, ${anno.y}): "${anno.text}"\n`;
        break;
      }
    }
  }

  return section;
}
