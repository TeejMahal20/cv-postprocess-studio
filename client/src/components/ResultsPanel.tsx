import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import type { ExecuteResponse } from '../../../shared/types';

interface ResultsPanelProps {
  result: ExecuteResponse | null;
}

type Tab = 'output' | 'errors' | 'json';

export default function ResultsPanel({ result }: ResultsPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('output');
  const [copied, setCopied] = useState(false);

  if (!result) return null;

  const content = {
    output: result.stdout || '(no output)',
    errors: result.stderr || '(no errors)',
    json: result.result ? JSON.stringify(result.result, null, 2) : '(no result)',
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="border border-gray-700 rounded overflow-hidden">
      <div className="flex items-center border-b border-gray-700 bg-gray-800">
        {(['output', 'errors', 'json'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs capitalize ${
              activeTab === tab
                ? 'text-gray-200 border-b-2 border-blue-500'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
        <button
          onClick={handleCopy}
          className="ml-auto px-2 py-1 text-gray-500 hover:text-gray-300"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
      <pre className="p-3 text-xs font-mono overflow-auto max-h-[200px] bg-gray-900 text-gray-300 whitespace-pre-wrap">
        {content[activeTab]}
      </pre>
    </div>
  );
}
