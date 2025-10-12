import { useState, useRef, useEffect } from 'react';
import type { Message } from '../hooks/useAiAgent';
import { Button } from './ui';

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
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Compact Toolbar */}
      <div className="flex items-center justify-end px-3 py-1" style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)' }}>
        {onNewConversation && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onNewConversation}
            title="Start new conversation"
            disabled={isStreaming}
          >
            + New
          </Button>
        )}
      </div>

      {/* Message history area */}
      {(messages.length > 0 || streamingResponse) && (
        <div
          ref={responseRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
          style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-primary)' }}
        >
          {messages.map((message) => {
            // User message
            if (message.type === 'user') {
              return (
                <div key={message.id} className="flex gap-2 justify-end">
                  <div className="max-w-[85%] rounded-lg px-3 py-2" style={{
                    backgroundColor: 'var(--accent-primary)',
                    color: 'var(--text-inverse)'
                  }}>
                    <div className="text-xs mb-1" style={{ opacity: 0.8 }}>You</div>
                    <div className="text-sm whitespace-pre-wrap font-mono">{message.content}</div>
                  </div>
                </div>
              );
            }

            // Assistant text message
            if (message.type === 'assistant') {
              return (
                <div key={message.id} className="flex gap-2 justify-start">
                  <div className="max-w-[85%] rounded-lg px-3 py-2 border" style={{
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    borderColor: 'var(--border-secondary)'
                  }}>
                    <div className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>AI</div>
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
                    className="rounded-lg px-3 py-2 border"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      borderColor: message.completed ? 'var(--color-success)' : 'var(--color-warning)'
                    }}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      {message.completed ? (
                        <span style={{ color: 'var(--color-success)' }}>✓</span>
                      ) : (
                        <svg
                          className="animate-spin h-4 w-4"
                          style={{ color: 'var(--color-warning)' }}
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
                      <span className="font-semibold" style={{ color: message.completed ? 'var(--color-success)' : 'var(--color-warning)' }}>
                        {message.toolName}
                      </span>
                      {message.completed && <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>completed</span>}
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
                    className="rounded-lg px-3 py-2 border"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      borderColor: tool.result ? 'var(--color-success)' : 'var(--color-warning)'
                    }}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      {tool.result ? (
                        <span style={{ color: 'var(--color-success)' }}>✓</span>
                      ) : (
                        <svg
                          className="animate-spin h-4 w-4"
                          style={{ color: 'var(--color-warning)' }}
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
                      <span className="font-semibold" style={{ color: tool.result ? 'var(--color-success)' : 'var(--color-warning)' }}>
                        {tool.name}
                      </span>
                      {tool.result && <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>completed</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Streaming text response */}
          {streamingResponse && (
            <div className="flex gap-2 justify-start">
              <div className="max-w-[85%] rounded-lg px-3 py-2 border" style={{
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                borderColor: 'var(--border-secondary)'
              }}>
                <div className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>AI</div>
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
          className="flex-1 rounded px-3 py-2 resize-none focus:outline-none focus:ring-2 text-sm"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            borderColor: 'var(--border-primary)'
          }}
          rows={2}
          disabled={isStreaming}
        />
        {isStreaming ? (
          <Button variant="danger" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!prompt.trim()}
            title="Submit prompt (⌘↵)"
          >
            Send
          </Button>
        )}
      </div>

      {/* Help text */}
      <div className="px-4 py-2 text-xs" style={{ color: 'var(--text-tertiary)', borderTop: '1px solid var(--border-primary)' }}>
        <span className="font-medium">⌘↵</span> to submit • <span className="font-medium">Esc</span> to cancel •{' '}
        <span className="font-medium">⌘K</span> to focus prompt
      </div>
    </div>
  );
}
