import { Download, Trash2, ArrowUpFromLine, Rocket } from 'lucide-react';
import type { RecipeListItem } from '../../../shared/types';

interface RecipeBrowserProps {
  recipes: RecipeListItem[];
  isLoading: boolean;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onDownload: (id: string) => void;
  onPromote: (id: string, name: string) => void;
}

export default function RecipeBrowser({
  recipes,
  isLoading,
  onLoad,
  onDelete,
  onDownload,
  onPromote,
}: RecipeBrowserProps) {
  if (isLoading) {
    return (
      <div className="text-xs text-gray-500 py-2">Loading recipes...</div>
    );
  }

  if (recipes.length === 0) {
    return (
      <div className="text-xs text-gray-500 py-2">
        No saved recipes yet. Generate code and click "Save as Recipe" to save
        one.
      </div>
    );
  }

  return (
    <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
      {recipes.map((recipe) => (
        <div
          key={recipe.id}
          className="p-2 rounded bg-gray-800 border border-gray-700 group"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-gray-200 truncate">
                {recipe.name}
              </div>
              {recipe.description && (
                <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">
                  {recipe.description}
                </div>
              )}
              <div className="flex items-center gap-2 mt-1">
                {recipe.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {recipe.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-[9px] px-1 py-0.5 rounded bg-gray-700 text-gray-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <span className="text-[9px] text-gray-600">
                  {new Date(recipe.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => onLoad(recipe.id)}
                title="Load recipe"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-blue-400 hover:bg-blue-500/20"
              >
                <ArrowUpFromLine className="w-3 h-3" />
                Load
              </button>
              <button
                onClick={() => onPromote(recipe.id, recipe.name)}
                title="Promote to Triton"
                className="p-1 rounded text-gray-500 hover:text-orange-400 hover:bg-gray-700"
              >
                <Rocket className="w-3 h-3" />
              </button>
              <button
                onClick={() => onDownload(recipe.id)}
                title="Download .py"
                className="p-1 rounded text-gray-500 hover:text-green-400 hover:bg-gray-700"
              >
                <Download className="w-3 h-3" />
              </button>
              <button
                onClick={() => onDelete(recipe.id)}
                title="Delete"
                className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-gray-700"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
