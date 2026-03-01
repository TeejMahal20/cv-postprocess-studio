import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import type {
  Recipe,
  RecipeListItem,
  CreateRecipeRequest,
} from '../../../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RECIPES_DIR = path.resolve(
  process.env.RECIPES_DIR || path.join(__dirname, '../../../recipes'),
);

const VALID_ID = /^[a-zA-Z0-9-]+$/;

export async function ensureRecipesDir(): Promise<void> {
  await fs.mkdir(RECIPES_DIR, { recursive: true });
}

export async function listRecipes(): Promise<RecipeListItem[]> {
  await ensureRecipesDir();
  const files = await fs.readdir(RECIPES_DIR);
  const items: RecipeListItem[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(RECIPES_DIR, file), 'utf-8');
      const recipe: Recipe = JSON.parse(raw);
      items.push({
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        created_at: recipe.created_at,
        tags: recipe.tags,
        source: {
          categories: recipe.source.categories,
          image_filename: recipe.source.image_filename,
        },
      });
    } catch {
      // skip malformed files
    }
  }

  // Newest first
  items.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return items;
}

export async function getRecipe(id: string): Promise<Recipe> {
  if (!VALID_ID.test(id)) {
    throw Object.assign(new Error('Invalid recipe ID'), { status: 400 });
  }
  const filePath = path.join(RECIPES_DIR, `${id}.json`);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('Recipe not found'), { status: 404 });
  }
}

export async function createRecipe(
  req: CreateRecipeRequest,
): Promise<Recipe> {
  await ensureRecipesDir();
  const now = new Date().toISOString();
  const recipe: Recipe = {
    id: uuidv4(),
    name: req.name,
    description: req.description,
    code: req.code,
    prompt: req.prompt,
    chat_history: req.chat_history || [],
    last_result: req.last_result || null,
    created_at: now,
    updated_at: now,
    source: req.source,
    tags: req.tags,
  };
  await fs.writeFile(
    path.join(RECIPES_DIR, `${recipe.id}.json`),
    JSON.stringify(recipe, null, 2),
  );
  return recipe;
}

export async function deleteRecipe(id: string): Promise<void> {
  if (!VALID_ID.test(id)) {
    throw Object.assign(new Error('Invalid recipe ID'), { status: 400 });
  }
  const filePath = path.join(RECIPES_DIR, `${id}.json`);
  try {
    await fs.access(filePath);
    await fs.unlink(filePath);
  } catch {
    throw Object.assign(new Error('Recipe not found'), { status: 404 });
  }
}
