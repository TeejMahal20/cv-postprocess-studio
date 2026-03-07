import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import type { Server } from 'http';
import { errorHandler } from './middleware/errorHandler.js';
import { uploadRouter } from './routes/upload.js';
import { executeRouter } from './routes/execute.js';
import { agentRouter } from './routes/agent.js';
import { recipesRouter } from './routes/recipes.js';
import { promoteRouter } from './routes/promote.js';
import { ensureRecipesDir } from './services/recipeService.js';

dotenv.config({ path: '../.env' });

// --- Memory & process monitoring ---
function logMemory(label: string) {
  const mem = process.memoryUsage();
  console.log(
    `[MEM ${label}] heap: ${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB / ${(mem.heapTotal / 1024 / 1024).toFixed(1)}MB, rss: ${(mem.rss / 1024 / 1024).toFixed(1)}MB`,
  );
}

// Log memory every 60s so we can spot trends
setInterval(() => logMemory('periodic'), 60_000).unref();

let server: Server | null = null;

// Prevent runtime errors from killing the server
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  logMemory('uncaughtException');
  // Let startup errors (like EADDRINUSE) actually kill the process
  // so that --watch can restart cleanly
  if (!server) {
    console.error('[FATAL] Exception during startup, exiting');
    process.exit(1);
  }
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
  logMemory('unhandledRejection');
});
process.on('warning', (warning) => {
  console.warn('[PROCESS WARNING]', warning.name, warning.message);
  if (warning.stack) console.warn(warning.stack);
});
process.on('exit', (code) => {
  console.error(`[PROCESS EXIT] code=${code}`);
});
// Graceful shutdown for --watch restarts
function shutdown(signal: string) {
  console.error(`[${signal}] Shutting down gracefully...`);
  logMemory(signal);
  if (server) {
    server.close(() => {
      console.error(`[${signal}] Server closed`);
      process.exit(0);
    });
    // Force exit after 2s if close hangs
    setTimeout(() => process.exit(0), 2000).unref();
  } else {
    process.exit(0);
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.use(cors({ origin: /^http:\/\/localhost:\d+$/ }));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/api', uploadRouter);
app.use('/api', executeRouter);
app.use('/api', agentRouter);
app.use('/api', recipesRouter);
app.use('/api', promoteRouter);

app.use(errorHandler);

// Ensure recipes directory exists, then start
ensureRecipesDir()
  .then(() => {
    server = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      logMemory('startup');
    });
  })
  .catch(console.error);
