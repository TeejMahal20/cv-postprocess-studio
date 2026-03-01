import { Router } from 'express';
import type { CreateRecipeRequest } from '../../../shared/types.js';
import {
  listRecipes,
  getRecipe,
  createRecipe,
  deleteRecipe,
} from '../services/recipeService.js';

export const recipesRouter = Router();

recipesRouter.get('/recipes', async (_req, res, next) => {
  try {
    const recipes = await listRecipes();
    res.json(recipes);
  } catch (err) {
    next(err);
  }
});

recipesRouter.get('/recipes/:id', async (req, res, next) => {
  try {
    const recipe = await getRecipe(req.params.id);
    res.json(recipe);
  } catch (err) {
    next(err);
  }
});

recipesRouter.post('/recipes', async (req, res, next) => {
  try {
    const body = req.body as CreateRecipeRequest;
    if (!body.name || !body.code) {
      res.status(400).json({ error: 'name and code are required' });
      return;
    }
    const recipe = await createRecipe(body);
    res.status(201).json(recipe);
  } catch (err) {
    next(err);
  }
});

recipesRouter.delete('/recipes/:id', async (req, res, next) => {
  try {
    await deleteRecipe(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
