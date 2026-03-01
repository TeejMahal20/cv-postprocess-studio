import { useState } from 'react';
import { X } from 'lucide-react';

interface SaveRecipeDialogProps {
  defaultDescription: string;
  onSave: (name: string, description: string, tags: string[]) => void;
  onCancel: () => void;
}

export default function SaveRecipeDialog({
  defaultDescription,
  onSave,
  onCancel,
}: SaveRecipeDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState(defaultDescription);
  const [tagsInput, setTagsInput] = useState('');

  const handleSave = () => {
    if (!name.trim()) return;
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    onSave(name.trim(), description.trim(), tags);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-800 border border-gray-700 rounded-lg w-[400px] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-200">
            Save as Recipe
          </h3>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Defect area measurement"
              className="w-full px-3 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm focus:border-blue-500 focus:outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm resize-none focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. area, defects, battery"
              className="w-full px-3 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-gray-200 bg-gray-700 hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-3 py-1.5 rounded text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
