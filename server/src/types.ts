import type { ExecuteResult } from '../../shared/types.js';

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
}

export interface RunState {
  id: string;
  timestamp: Date;
  code: string;
  status: 'pending' | 'running' | 'success' | 'error';
  result: ExecuteResult | null;
}
