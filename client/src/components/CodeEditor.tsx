import { useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { BookmarkPlus, Download } from 'lucide-react';

interface CodeEditorProps {
  code: string;
  onChange: (code: string) => void;
  onSaveRecipe?: () => void;
}

export default function CodeEditor({
  code,
  onChange,
  onSaveRecipe,
}: CodeEditorProps) {
  const handleDownload = useCallback(() => {
    const blob = new Blob([code], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'script.py';
    a.click();
    URL.revokeObjectURL(url);
  }, [code]);

  return (
    <div className="border border-gray-700 rounded overflow-hidden">
      <div className="px-3 py-1.5 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
        <span className="text-xs text-gray-400">Python</span>
        <div className="flex items-center gap-1">
          {onSaveRecipe && (
            <button
              onClick={onSaveRecipe}
              title="Save as Recipe"
              className="p-1 rounded text-gray-500 hover:text-blue-400 hover:bg-gray-700"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={handleDownload}
            title="Download .py"
            className="p-1 rounded text-gray-500 hover:text-green-400 hover:bg-gray-700"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <Editor
        height="300px"
        language="python"
        theme="vs-dark"
        value={code}
        onChange={(v) => onChange(v || '')}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          padding: { top: 8 },
        }}
        loading={
          <div className="h-[300px] flex items-center justify-center bg-gray-900 text-gray-500 text-sm">
            Loading editor...
          </div>
        }
      />
    </div>
  );
}
