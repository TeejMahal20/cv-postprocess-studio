import axios from 'axios';
import type {
  UploadResponse,
  SwitchImageResponse,
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

export interface StreamCallbacks {
  onThinkingDelta?: (text: string) => void;
  onTextDelta?: (text: string) => void;
  onThinkingDone?: () => void;
  onDone?: (response: AgentResponse) => void;
  onError?: (error: Error) => void;
}

export async function invokeAgentStream(
  request: AgentRequest,
  callbacks: StreamCallbacks,
): Promise<AgentResponse> {
  const res = await fetch('/api/agent/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Stream request failed: ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResponse: AgentResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE lines from the buffer
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7);
      } else if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        switch (currentEvent) {
          case 'thinking_delta':
            callbacks.onThinkingDelta?.(data);
            break;
          case 'text_delta':
            callbacks.onTextDelta?.(data);
            break;
          case 'thinking_done':
            callbacks.onThinkingDone?.();
            break;
          case 'done':
            finalResponse = JSON.parse(data) as AgentResponse;
            callbacks.onDone?.(finalResponse);
            break;
        }
      }
    }
  }

  if (!finalResponse) {
    throw new Error('Stream ended without a final response');
  }
  return finalResponse;
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

export function getImageUrl(sessionId: string, filename: string): string {
  return `/api/workspace/${sessionId}/images/${filename}`;
}

export async function uploadFolder(files: File[]): Promise<UploadResponse> {
  const form = new FormData();
  for (const file of files) {
    form.append('files', file, (file as any).webkitRelativePath || file.name);
  }
  const { data } = await api.post<UploadResponse>('/upload-folder', form);
  return data;
}

export async function switchImage(
  sessionId: string,
  index: number,
): Promise<SwitchImageResponse> {
  const { data } = await api.post<SwitchImageResponse>(
    `/sessions/${sessionId}/switch-image`,
    { index },
  );
  return data;
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
