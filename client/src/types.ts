export type {
  COCOImage,
  COCOCategory,
  COCOAnnotation,
  COCODataset,
  UploadResponse,
  CalibrationConfig,
  AgentRequest,
  AgentResponse,
  ExecuteRequest,
  ExecuteResponse,
  ExecuteResult,
  ResultOverlay,
  MaskOverlay,
  BboxOverlay,
  ContourOverlay,
  MeasurementOverlay,
  TextOverlay,
  CTQResult,
  Recipe,
  RecipeListItem,
  CreateRecipeRequest,
  RunHistoryEntry,
  PromoteRequest,
  PromoteResponse,
} from '../../shared/types';

export type ExecutionStatus = 'idle' | 'running' | 'success' | 'error';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'error' | 'system';
  content: string;
  code?: string;
  timestamp: number;
}
