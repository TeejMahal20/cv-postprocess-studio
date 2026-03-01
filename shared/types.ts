// --- COCO Format Types ---
export interface COCOImage {
  id: number;
  file_name: string;
  width: number;
  height: number;
}

export interface COCOCategory {
  id: number;
  name: string;
  supercategory?: string;
}

export interface COCOAnnotation {
  id: number;
  image_id: number;
  category_id: number;
  bbox: [number, number, number, number]; // [x, y, w, h]
  area: number;
  segmentation: number[][] | { counts: string; size: [number, number] };
  iscrowd: number;
  score?: number;
}

export interface COCODataset {
  images: COCOImage[];
  annotations: COCOAnnotation[];
  categories: COCOCategory[];
}

// --- Upload Types ---
export interface UploadResponse {
  session_id: string;
  image: { filename: string; width: number; height: number };
  coco: {
    annotation_count: number;
    categories: COCOCategory[];
    segmentation_type: 'polygon' | 'rle' | 'mixed';
    has_rle: boolean;
    has_scores: boolean;
  };
  additional_masks: string[];
}

// --- Calibration ---
export interface CalibrationConfig {
  enabled: boolean;
  pixels_per_mm: number;
  unit_label: string; // e.g. "mm", "in", "um"
}

// --- Agent Types ---
export interface AgentRequest {
  prompt: string;
  session_id: string;
  context: {
    image_info: { width: number; height: number; filename: string };
    coco_summary: {
      annotation_count: number;
      categories: string[];
      segmentation_type: string;
      has_scores: boolean;
    };
    calibration: CalibrationConfig;
    previous_code: string | null;
    previous_result: ExecuteResult | null;
    previous_error: string | null;
  };
}

export interface AgentResponse {
  code: string;
  explanation: string;
  agent_message_id: string;
}

// --- Execution Types ---
export interface ExecuteRequest {
  session_id: string;
  code: string;
  config: CalibrationConfig;
}

// --- Result Overlay Types ---
export interface MaskOverlay {
  type: 'mask';
  filename?: string;
  data?: string; // base64
  color: string;
  opacity: number;
  label: string;
}

export interface BboxOverlay {
  type: 'bboxes';
  boxes: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    color: string;
  }>;
}

export interface ContourOverlay {
  type: 'contours';
  points: [number, number][];
  color: string;
  label: string;
}

export interface MeasurementOverlay {
  type: 'measurements';
  lines: Array<{
    start: [number, number];
    end: [number, number];
    value: string;
    color: string;
  }>;
}

export interface TextOverlay {
  type: 'text';
  entries: Array<{
    x: number;
    y: number;
    text: string;
    color: string;
    size?: number;
  }>;
}

export type ResultOverlay =
  | MaskOverlay
  | BboxOverlay
  | ContourOverlay
  | MeasurementOverlay
  | TextOverlay;

// --- CTQ Results ---
export interface CTQResult {
  feature_id: number;
  label: string;
  category?: string;
  measurements: Record<string, number>;
  [key: string]: unknown; // allow arbitrary extra fields
}

export interface ExecuteResult {
  overlays: ResultOverlay[];
  metrics: Record<string, unknown>;
  ctq_results: CTQResult[];
  stdout: string;
}

export interface ExecuteResponse {
  success: boolean;
  result?: ExecuteResult;
  error?: string;
  stderr?: string;
  stdout?: string;
  execution_time_ms: number;
  run_id: string;
  output_files: string[];
}

// --- Recipe Types ---
export interface RecipeChatMessage {
  role: 'user' | 'assistant' | 'error' | 'system';
  content: string;
  code?: string;
  timestamp: number;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  code: string;
  prompt: string;
  chat_history: RecipeChatMessage[];
  last_result: ExecuteResult | null;
  created_at: string;
  updated_at: string;
  source: {
    image_filename: string;
    image_dimensions: { width: number; height: number };
    categories: string[];
    annotation_count: number;
  };
  tags: string[];
}

export interface RecipeListItem {
  id: string;
  name: string;
  description: string;
  created_at: string;
  tags: string[];
  source: { categories: string[]; image_filename: string };
}

export interface CreateRecipeRequest {
  name: string;
  description: string;
  code: string;
  prompt: string;
  chat_history: RecipeChatMessage[];
  last_result: ExecuteResult | null;
  tags: string[];
  source: Recipe['source'];
}

// --- Run History ---
export interface RunHistoryEntry {
  id: string;
  timestamp: string;
  status: 'success' | 'error';
  code: string;
  ctq_count: number;
  metrics_summary: Record<string, unknown> | null;
}

// --- Promotion Types ---
export interface PromoteRequest {
  model_name: string;
}

export interface PromoteResponse {
  success: boolean;
  model_name: string;
  model_dir: string;
  artifacts: { model_py: string; config_pbtxt: string };
  agent_message_id: string;
}
