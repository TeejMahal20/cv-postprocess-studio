import { useState, useCallback } from 'react';
import { invokeAgent } from '../api';
import type {
  AgentResponse,
  UploadResponse,
  CalibrationConfig,
  ExecuteResult,
} from '../../../shared/types';
import type { ChatMessage } from '../types';

interface AgentContext {
  sessionId: string;
  uploadResult: UploadResponse;
  calibration: CalibrationConfig;
  previousCode: string | null;
  previousResult: ExecuteResult | null;
  previousError: string | null;
}

export function useAgent() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  const generate = useCallback(
    async (prompt: string, context: AgentContext): Promise<AgentResponse> => {
      setIsGenerating(true);
      try {
        const response = await invokeAgent({
          prompt,
          session_id: context.sessionId,
          context: {
            image_info: {
              width: context.uploadResult.image.width,
              height: context.uploadResult.image.height,
              filename: context.uploadResult.image.filename,
            },
            coco_summary: {
              annotation_count: context.uploadResult.coco.annotation_count,
              categories: context.uploadResult.coco.categories.map(
                (c) => c.name,
              ),
              segmentation_type: context.uploadResult.coco.segmentation_type,
              has_scores: context.uploadResult.coco.has_scores,
            },
            calibration: context.calibration,
            previous_code: context.previousCode,
            previous_result: context.previousResult,
            previous_error: context.previousError,
          },
        });

        setChatHistory((prev) => [
          ...prev,
          { role: 'user', content: prompt, timestamp: Date.now() },
          {
            role: 'assistant',
            content: response.explanation,
            code: response.code,
            timestamp: Date.now(),
          },
        ]);

        return response;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Agent invocation failed';
        setChatHistory((prev) => [
          ...prev,
          { role: 'user', content: prompt, timestamp: Date.now() },
          { role: 'error', content: msg, timestamp: Date.now() },
        ]);
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
    [],
  );

  const clearHistory = useCallback(() => {
    setChatHistory([]);
  }, []);

  const setHistory = useCallback((history: ChatMessage[]) => {
    setChatHistory(history);
  }, []);

  const addSystemMessage = useCallback((content: string) => {
    setChatHistory((prev) => [
      ...prev,
      { role: 'system', content, timestamp: Date.now() },
    ]);
  }, []);

  return { generate, isGenerating, chatHistory, clearHistory, setHistory, addSystemMessage };
}
