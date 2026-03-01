import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler.js';
import { uploadRouter } from './routes/upload.js';
import { executeRouter } from './routes/execute.js';
import { agentRouter } from './routes/agent.js';
import { recipesRouter } from './routes/recipes.js';
import { promoteRouter } from './routes/promote.js';
import { ensureRecipesDir } from './services/recipeService.js';

dotenv.config({ path: '../.env' });

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
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch(console.error);
