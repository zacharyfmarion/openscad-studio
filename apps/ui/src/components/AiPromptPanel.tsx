import { useState, useRef, useEffect } from 'react';
import type { Message } from '../hooks/useAiAgent';

export type AiMode = 'edit';

interface AiPromptPanelProps {
  onSubmit: (prompt: string, mode: AiMode) => void;
  isStreaming: boolean;
  streamingResponse: string | null;
  onCancel: () => void;
  messages?: Message[];
  onNewConversation?: () => void;
  currentToolCalls?: import('../hooks/useAiAgent').ToolCall[];
}

export function AiPromptPanel({
  onSubmit,
  isStreaming,
  streamingResponse,
  onCancel,
  messages = [],
  onNewConversation,
  currentToolCalls = [],
}: AiPromptPanelProps) {
  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const responseRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages or streaming response changes
  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [messages, streamingResponse]);

  const handleSubmit = () => {
    if (!prompt.trim() || isStreaming) return;
    onSubmit(prompt, 'edit');
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

  // Auto-focus prompt when not streaming
  useEffect(() => {
    if (!isStreaming && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isStreaming]);

  return (
    <div className="h-full flex flex-col bg-gray-800">
      {/* Compact Toolbar */}
      <div className="flex items-center justify-end px-3 py-1 bg-gray-750 border-b border-gray-700">
        {onNewConversation && (
          <button
            onClick={onNewConversation}
            className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-xs transition-colors"
            title="Start new conversation"
            disabled={isStreaming}
          >
            + New
          </button>
        )}
      </div>

      {/* Message history area */}
      {(messages.length > 0 || streamingResponse) && (
        <div
          ref={responseRef}
          className="flex-1 overflow-y-auto px-4 py-3 bg-gray-900/50 border-b border-gray-700 space-y-3"
        >
          {messages.map((message) => {
            // User message
            if (message.type === 'user') {
              return (
                <div key={message.id} className="flex gap-2 justify-end">
                  <div className="max-w-[85%] rounded-lg px-3 py-2 bg-blue-600 text-white">
                    <div className="text-xs opacity-70 mb-1">You</div>
                    <div className="text-sm whitespace-pre-wrap font-mono">{message.content}</div>
                  </div>
                </div>
              );
            }

            // Assistant text message
            if (message.type === 'assistant') {
              return (
                <div key={message.id} className="flex gap-2 justify-start">
                  <div className="max-w-[85%] rounded-lg px-3 py-2 bg-gray-700 text-gray-100">
                    <div className="text-xs opacity-70 mb-1">AI</div>
                    <div className="text-sm whitespace-pre-wrap font-mono">{message.content}</div>
                  </div>
                </div>
              );
            }

            // Tool call message (permanent, after completion)
            if (message.type === 'tool-call') {
              return (
                <div key={message.id} className="flex gap-2 justify-start">
                  <div
                    className={`rounded-lg px-3 py-2 border ${
                      message.completed
                        ? 'bg-gray-800 border-green-400/30'
                        : 'bg-gray-800 border-yellow-400/30'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      {message.completed ? (
                        <span className="text-green-400">✓</span>
                      ) : (
                        <svg
                          className="animate-spin h-4 w-4 text-yellow-400"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                      )}
                      <span className={`font-semibold ${message.completed ? 'text-green-400' : 'text-yellow-400'}`}>
                        {message.toolName}
                      </span>
                      {message.completed && <span className="text-gray-400 text-xs">completed</span>}
                    </div>
                  </div>
                </div>
              );
            }

            // Tool result messages are no longer used
            return null;
          })}
          {/* Current tool calls - shown even without text */}
          {currentToolCalls.length > 0 && (
            <div className="flex gap-2 justify-start">
              <div className="space-y-2">
                {currentToolCalls.map((tool, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg px-3 py-2 border ${
                      tool.result
                        ? 'bg-gray-800 border-green-400/30'
                        : 'bg-gray-800 border-yellow-400/30'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      {tool.result ? (
                        <span className="text-green-400">✓</span>
                      ) : (
                        <svg
                          className="animate-spin h-4 w-4 text-yellow-400"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                      )}
                      <span className={`font-semibold ${tool.result ? 'text-green-400' : 'text-yellow-400'}`}>
                        {tool.name}
                      </span>
                      {tool.result && <span className="text-gray-400 text-xs">completed</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Streaming text response */}
          {streamingResponse && (
            <div className="flex gap-2 justify-start">
              <div className="max-w-[85%] rounded-lg px-3 py-2 bg-gray-700 text-gray-100">
                <div className="text-xs opacity-70 mb-1">AI</div>
                <div className="text-sm whitespace-pre-wrap font-mono">{streamingResponse}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Prompt input area */}
      <div className="p-3 flex gap-2">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe the changes you want to make..."
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
