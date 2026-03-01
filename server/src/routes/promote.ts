import { Router } from 'express';
import type { PromoteRequest } from '../../../shared/types.js';
import { getRecipe } from '../services/recipeService.js';
import { promoteRecipe } from '../services/promotionService.js';

export const promoteRouter = Router();

promoteRouter.post('/recipes/:id/promote', async (req, res, next) => {
  try {
    const recipe = await getRecipe(req.params.id);
    const body = req.body as PromoteRequest;

    if (!body.model_name) {
      res.status(400).json({ error: 'model_name is required' });
      return;
    }

    const result = await promoteRecipe(recipe, body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
