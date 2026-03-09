import { useState, useCallback, useEffect } from 'react';
import type { AxiosError } from 'axios';
import type {
  Recipe,
  RecipeListItem,
  CreateRecipeRequest,
  PromoteRequest,
  PromoteResponse,
} from '../../../shared/types';
import {
  fetchRecipes,
  fetchRecipe,
  saveRecipe,
  removeRecipe,
  promoteRecipe as apiPromoteRecipe,
} from '../api';

export type PromoteStatus =
  | { state: 'idle' }
  | { state: 'promoting' }
  | { state: 'success'; result: PromoteResponse }
  | { state: 'error'; error: string };

export function useRecipes() {
  const [recipes, setRecipes] = useState<RecipeListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [promoteStatus, setPromoteStatus] = useState<PromoteStatus>({ state: 'idle' });

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await fetchRecipes();
      setRecipes(list);
    } catch (err) {
      console.error('Failed to fetch recipes:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const save = useCallback(
    async (req: CreateRecipeRequest): Promise<Recipe> => {
      const recipe = await saveRecipe(req);
      await refresh();
      return recipe;
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await removeRecipe(id);
      await refresh();
    },
    [refresh],
  );

  const load = useCallback(async (id: string): Promise<Recipe> => {
    return fetchRecipe(id);
  }, []);

  const promote = useCallback(
    async (id: string, request: PromoteRequest): Promise<PromoteResponse> => {
      setPromoteStatus({ state: 'promoting' });
      try {
        const result = await apiPromoteRecipe(id, request);
        setPromoteStatus({ state: 'success', result });
        return result;
      } catch (err) {
        const axErr = err as AxiosError<{ error?: string }>;
        const msg =
          axErr.response?.data?.error ||
          (err instanceof Error ? err.message : 'Promotion failed');
        setPromoteStatus({ state: 'error', error: msg });
        throw err;
      }
    },
    [],
  );

  const clearPromoteStatus = useCallback(() => {
    setPromoteStatus({ state: 'idle' });
  }, []);

  // Fetch on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    recipes,
    isLoading,
    refresh,
    save,
    remove,
    load,
    promote,
    promoteStatus,
    clearPromoteStatus,
  };
}
