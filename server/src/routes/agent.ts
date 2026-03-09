import { Router } from 'express';
import { getSession } from '../services/fileService.js';
import { invokeAgent, invokeAgentStream } from '../services/agentService.js';
import type { AgentRequest } from '../../../shared/types.js';

export const agentRouter = Router();

agentRouter.post('/agent/invoke', async (req, res, next) => {
  try {
    const request = req.body as AgentRequest;

    if (!request.session_id || !request.prompt) {
      res.status(400).json({ error: 'session_id and prompt are required' });
      return;
    }

    if (!getSession(request.session_id)) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const response = await invokeAgent(request);
    res.json(response);
  } catch (err) {
    next(err);
  }
});

agentRouter.post('/agent/stream', async (req, res, next) => {
  try {
    const request = req.body as AgentRequest;

    if (!request.session_id || !request.prompt) {
      res.status(400).json({ error: 'session_id and prompt are required' });
      return;
    }

    if (!getSession(request.session_id)) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    await invokeAgentStream(request, res);
  } catch (err) {
    if (!res.headersSent) {
      next(err);
    } else {
      res.end();
    }
  }
});
