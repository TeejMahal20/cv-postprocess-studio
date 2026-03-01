import axios from 'axios';
import type {
  UploadResponse,
  AgentRequest,
  AgentResponse,
  ExecuteRequest,
  ExecuteResponse,
  Recipe,
  RecipeListItem,
  CreateRecipeRequest,
  RunHistoryEntry,
  PromoteRequest,
  PromoteResponse,
} from '../../shared/types';

const api = axios.create({ baseURL: '/api' });

export async function uploadFiles(
  image: File,
  coco: File,
  masks?: File[],
): Promise<UploadResponse> {
  const form = new FormData();
  form.append('image', image);
  form.append('coco', coco);
  masks?.forEach((m) => form.append('masks', m));
  const { data } = await api.post<UploadResponse>('/upload', form);
  return data;
}

export async function invokeAgent(
  request: AgentRequest,
): Promise<AgentResponse> {
  const { data } = await api.post<AgentResponse>('/agent/invoke', request);
  return data;
}

export async function executeCode(
  request: ExecuteRequest,
): Promise<ExecuteResponse> {
  const { data } = await api.post<ExecuteResponse>('/execute', request);
  return data;
}

export function getFileUrl(sessionId: string, filename: string): string {
  return `/api/workspace/${sessionId}/files/${filename}`;
}

export function getOutputUrl(
  sessionId: string,
  runId: string,
  filename: string,
): string {
  return `/api/workspace/${sessionId}/runs/${runId}/outputs/${filename}`;
}

// --- Recipe API ---

export async function fetchRecipes(): Promise<RecipeListItem[]> {
  const { data } = await api.get<RecipeListItem[]>('/recipes');
  return data;
}

export async function fetchRecipe(id: string): Promise<Recipe> {
  const { data } = await api.get<Recipe>(`/recipes/${id}`);
  return data;
}

export async function saveRecipe(
  req: CreateRecipeRequest,
): Promise<Recipe> {
  const { data } = await api.post<Recipe>('/recipes', req);
  return data;
}

export async function removeRecipe(id: string): Promise<void> {
  await api.delete(`/recipes/${id}`);
}

// --- Promotion API ---

export async function promoteRecipe(
  id: string,
  request: PromoteRequest,
): Promise<PromoteResponse> {
  const { data } = await api.post<PromoteResponse>(
    `/recipes/${id}/promote`,
    request,
  );
  return data;
}

// --- Run History API ---

export async function fetchSessionRuns(
  sessionId: string,
): Promise<RunHistoryEntry[]> {
  const { data } = await api.get<RunHistoryEntry[]>(
    `/sessions/${sessionId}/runs`,
  );
  return data;
}
