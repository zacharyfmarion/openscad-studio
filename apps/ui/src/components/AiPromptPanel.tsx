import { useState, useRef, useEffect } from 'react';
import type { Diagnostic } from '../api/tauri';

export type AiMode = 'generate' | 'edit' | 'fix' | 'explain';

interface AiPromptPanelProps {
  onSubmit: (prompt: string, mode: AiMode) => void;
  isStreaming: boolean;
  streamingResponse: string | null;
  onCancel: () => void;
  diagnostics?: Diagnostic[];
}

export function AiPromptPanel({
  onSubmit,
  isStreaming,
  streamingResponse,
  onCancel,
  diagnostics = [],
}: AiPromptPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<AiMode>('edit');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const responseRef = useRef<HTMLDivElement>(null);

  // Auto-scroll streaming response to bottom
  useEffect(() => {
    if (responseRef.current && streamingResponse) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [streamingResponse]);

  const handleSubmit = () => {
    if (!prompt.trim() || isStreaming) return;
    onSubmit(prompt, mode);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd+Enter / Ctrl+Enter to submit
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    // Escape to cancel
    if (e.key === 'Escape' && isStreaming) {
      e.preventDefault();
      onCancel();
    }
  };

  // Get mode button class
  const getModeButtonClass = (buttonMode: AiMode) => {
    const isActive = mode === buttonMode;
    return `px-3 py-1 rounded text-xs font-medium transition-colors ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
    }`;
  };

  // Auto-focus prompt when not streaming
  useEffect(() => {
    if (!isStreaming && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isStreaming]);

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;

  return (
    <div className="h-full flex flex-col bg-gray-800 border-t border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-750 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-200">🤖 AI Copilot</span>
          {errorCount > 0 && mode === 'fix' && (
            <span className="text-xs bg-red-900/40 text-red-400 px-2 py-0.5 rounded">
              {errorCount} error{errorCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Mode:</span>
          <button
            onClick={() => setMode('generate')}
            className={getModeButtonClass('generate')}
            disabled={isStreaming}
            title="Generate new code from scratch"
          >
            Generate
          </button>
          <button
            onClick={() => setMode('edit')}
            className={getModeButtonClass('edit')}
            disabled={isStreaming}
            title="Edit existing code"
          >
            Edit
          </button>
          <button
            onClick={() => setMode('fix')}
            className={getModeButtonClass('fix')}
            disabled={isStreaming}
            title="Fix errors in code"
          >
            Fix
          </button>
          <button
            onClick={() => setMode('explain')}
            className={getModeButtonClass('explain')}
            disabled={isStreaming}
            title="Explain what the code does"
          >
            Explain
          </button>
        </div>
      </div>

      {/* Streaming response area */}
      {streamingResponse && (
        <div
          ref={responseRef}
          className="flex-1 overflow-y-auto px-4 py-3 bg-gray-900/50 border-b border-gray-700 font-mono text-sm text-gray-300 whitespace-pre-wrap"
        >
          {streamingResponse}
        </div>
      )}

      {/* Prompt input area */}
      <div className="p-3 flex gap-2">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            mode === 'generate'
              ? 'Describe what you want to create...'
              : mode === 'edit'
              ? 'Describe the changes you want to make...'
              : mode === 'fix'
              ? 'Press Enter to fix errors automatically, or describe specific fixes...'
              : 'Ask a question about the code...'
          }
          className="flex-1 bg-gray-700 text-gray-100 rounded px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500 text-sm"
          rows={2}
          disabled={isStreaming}
        />
        {isStreaming ? (
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!prompt.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded text-sm font-medium transition-colors"
            title="Submit prompt (⌘↵)"
          >
            Send
          </button>
        )}
      </div>

      {/* Help text */}
      <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-700">
        <span className="font-medium">⌘↵</span> to submit • <span className="font-medium">Esc</span> to cancel •{' '}
        <span className="font-medium">⌘K</span> to focus prompt
      </div>
    </div>
  );
}
