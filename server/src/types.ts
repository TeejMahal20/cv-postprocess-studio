import type { ExecuteResult, ImageEntry } from '../../shared/types.js';

export interface SessionState {
  id: string;
  createdAt: Date;
  imageFile: string;
  cocoFile: string;
  cocoSummary: {
    annotation_count: number;
    categories: Array<{ id: number; name: string }>;
    segmentation_type: 'polygon' | 'rle' | 'mixed';
    has_rle: boolean;
    has_scores: boolean;
  };
  runs: RunState[];
  // Multi-image support
  allImages: ImageEntry[];
  currentIndex: number;
  fullCocoPath: string;
}

export interface RunState {
  id: string;
  timestamp: Date;
  code: string;
  status: 'pending' | 'running' | 'success' | 'error';
  result: ExecuteResult | null;
}
