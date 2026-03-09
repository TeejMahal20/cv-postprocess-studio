import { useState, useCallback, useRef } from 'react';
import { invokeAgent, invokeAgentStream } from '../api';
import type {
  AgentResponse,
  UploadResponse,
  CalibrationConfig,
  ExecuteResult,
  HumanAnnotation,
  ConversationMessage,
} from '../../../shared/types';
import type { ChatMessage } from '../types';

interface AgentContext {
  sessionId: string;
  uploadResult: UploadResponse;
  calibration: CalibrationConfig;
  previousCode: string | null;
  previousResult: ExecuteResult | null;
  previousError: string | null;
  humanAnnotations: HumanAnnotation[];
  canvasSnapshot: string | null;
  thinkingMode: 'auto' | 'on' | 'off';
}

function buildRequestContext(context: AgentContext) {
  return {
    image_info: {
      width: context.uploadResult.image.width,
      height: context.uploadResult.image.height,
      filename: context.uploadResult.image.filename,
    },
    coco_summary: {
      annotation_count: context.uploadResult.coco.annotation_count,
      categories: context.uploadResult.coco.categories.map((c) => c.name),
      segmentation_type: context.uploadResult.coco.segmentation_type,
      has_scores: context.uploadResult.coco.has_scores,
    },
    calibration: context.calibration,
    previous_code: context.previousCode,
    previous_result: context.previousResult,
    previous_error: context.previousError,
    human_annotations:
      context.humanAnnotations.length > 0
        ? context.humanAnnotations
        : undefined,
    canvas_snapshot: context.canvasSnapshot || undefined,
    thinking_mode: context.thinkingMode,
  };
}

export function useAgent() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const chatHistoryRef = useRef(chatHistory);
  chatHistoryRef.current = chatHistory;

  const generate = useCallback(
    async (prompt: string, context: AgentContext): Promise<AgentResponse> => {
      setIsGenerating(true);

      // Add user message + placeholder assistant message immediately
      const assistantTs = Date.now();
      setChatHistory((prev) => [
        ...prev,
        { role: 'user', content: prompt, timestamp: Date.now() },
        {
          role: 'assistant',
          content: '',
          thinking: '',
          timestamp: assistantTs,
        },
      ]);

      try {
        const response = await invokeAgentStream(
          {
            prompt,
            session_id: context.sessionId,
            context: buildRequestContext(context),
          },
          {
            onThinkingDelta: (text) => {
              setChatHistory((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.timestamp === assistantTs) {
                  updated[updated.length - 1] = {
                    ...last,
                    thinking: (last.thinking ?? '') + text,
                  };
                }
                return updated;
              });
            },
            onDone: (final) => {
              // Replace with the parsed final response
              setChatHistory((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.timestamp === assistantTs) {
                  updated[updated.length - 1] = {
                    ...last,
                    content: final.explanation,
                    code: final.code ?? undefined,
                    thinking: final.thinking ?? undefined,
                  };
                }
                return updated;
              });
            },
          },
        );

        return response;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Agent invocation failed';
        // Replace the placeholder with an error message
        setChatHistory((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.timestamp === assistantTs) {
            updated[updated.length - 1] = {
              role: 'error',
              content: msg,
              timestamp: assistantTs,
            };
          }
          return updated;
        });
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
    [],
  );

  const chat = useCallback(
    async (prompt: string, context: AgentContext): Promise<AgentResponse> => {
      setIsGenerating(true);
      try {
        // Build conversation history from chat (last 20 user/assistant messages)
        const history: ConversationMessage[] = chatHistoryRef.current
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .slice(-20)
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));

        const response = await invokeAgent({
          prompt,
          session_id: context.sessionId,
          mode: 'chat',
          conversation_history: history,
          context: buildRequestContext(context),
        });

        setChatHistory((prev) => [
          ...prev,
          { role: 'user', content: prompt, timestamp: Date.now() },
          {
            role: 'assistant',
            content: response.explanation,
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

  return { generate, chat, isGenerating, chatHistory, clearHistory, setHistory, addSystemMessage };
}
