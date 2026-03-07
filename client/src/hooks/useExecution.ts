import { useState, useCallback } from 'react';
import { executeCode } from '../api';
import type { CalibrationConfig, ExecuteResponse } from '../../../shared/types';

export function useExecution() {
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<ExecuteResponse | null>(null);

  const execute = useCallback(
    async (
      sessionId: string,
      code: string,
      config: CalibrationConfig,
    ): Promise<ExecuteResponse> => {
      setIsExecuting(true);
      try {
        const response = await executeCode({
          session_id: sessionId,
          code,
          config,
        });
        setResult(response);
        return response;
      } catch (err) {
        console.error('[useExecution] execute error:', err);
        const errorResponse: ExecuteResponse = {
          success: false,
          error: err instanceof Error ? err.message : 'Execution request failed',
          execution_time_ms: 0,
          run_id: '',
          output_files: [],
        };
        setResult(errorResponse);
        return errorResponse;
      } finally {
        setIsExecuting(false);
      }
    },
    [],
  );

  const clearResult = useCallback(() => {
    setResult(null);
  }, []);

  return { execute, isExecuting, result, clearResult };
}
