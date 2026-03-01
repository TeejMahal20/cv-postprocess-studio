import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { getSessionDir, getSession } from '../services/fileService.js';
import { executeCode } from '../services/executionService.js';
import type { ExecuteRequest, RunHistoryEntry } from '../../../shared/types.js';

export const executeRouter = Router();

executeRouter.post('/execute', async (req, res, next) => {
  try {
    const { session_id, code, config } = req.body as ExecuteRequest;

    if (!session_id || !code) {
      res.status(400).json({ error: 'session_id and code are required' });
      return;
    }

    if (!getSession(session_id)) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const result = await executeCode(session_id, code, config);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Run history for a session
executeRouter.get('/sessions/:sessionId/runs', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const entries: RunHistoryEntry[] = session.runs.map((run) => ({
    id: run.id,
    timestamp: run.timestamp.toISOString(),
    status: run.status === 'success' ? 'success' : 'error',
    code: run.code,
    ctq_count: run.result?.ctq_results?.length ?? 0,
    metrics_summary: run.result?.metrics ?? null,
  }));

  res.json(entries);
});

// Serve output files
executeRouter.get(
  '/workspace/:sessionId/runs/:runId/outputs/:filename',
  async (req, res, _next) => {
    try {
      const { sessionId, runId, filename } = req.params;
      const outputsDir = path.join(
        getSessionDir(sessionId),
        runId,
        'outputs',
      );
      const filePath = path.join(outputsDir, filename);

      // Security: prevent path traversal
      const resolved = path.resolve(filePath);
      const resolvedDir = path.resolve(outputsDir);
      if (!resolved.startsWith(resolvedDir)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      await fs.access(filePath);
      res.sendFile(resolved);
    } catch {
      res.status(404).json({ error: 'File not found' });
    }
  },
);
