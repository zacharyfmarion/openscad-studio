/** @jest-environment jsdom */

import { fireEvent, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { forwardRef } from 'react';
import type { AiPromptPanelProps } from '../AiPromptPanel';
import type { Message, ToolCall } from '../../types/aiChat';
import { renderWithProviders } from './test-utils';

jest.unstable_mockModule('@/components/ChatImage', () => ({
  ChatImage: ({ alt }: { alt: string }) => <div>{alt}</div>,
  ChatImageGrid: () => null,
}));

jest.unstable_mockModule('@/components/MarkdownMessage', () => ({
  MarkdownMessage: ({ content }: { content: string }) => <div>{content}</div>,
}));

jest.unstable_mockModule('@/components/ModelSelector', () => ({
  ModelSelector: () => <div data-testid="model-selector" />,
}));

jest.unstable_mockModule('@/components/AiComposer', () => ({
  AiComposer: forwardRef((props, ref) => {
    void props;
    void ref;
    return <div data-testid="ai-composer" />;
  }),
}));

jest.unstable_mockModule('@/components/AiAccessEmptyState', () => ({
  AiAccessEmptyState: () => <div data-testid="ai-access-empty-state" />,
}));

jest.unstable_mockModule('@/stores/apiKeyStore', () => ({
  useHasApiKey: () => true,
}));

let AiPromptPanel: typeof import('../AiPromptPanel').AiPromptPanel;

function createBaseProps(overrides: Partial<AiPromptPanelProps> = {}): AiPromptPanelProps {
  return {
    onSubmit: () => {},
    onTextChange: () => {},
    onFilesSelected: () => {},
    onRemoveAttachment: () => {},
    draft: { text: '', attachmentIds: [] },
    attachments: {},
    draftErrors: [],
    canSubmitDraft: false,
    isProcessingAttachments: false,
    isStreaming: false,
    streamingResponse: null,
    onCancel: () => {},
    messages: [],
    currentToolCalls: [],
    ...overrides,
  };
}

function createCompletedToolMessage(): Message {
  return {
    type: 'tool-call',
    id: 'message-1',
    toolCallId: 'tool-1',
    toolName: 'apply_edit',
    args: {
      path: 'main.scad',
      oldString: 'cube(1);',
      newString: 'cube(2);',
      rationale: 'make it larger',
    },
    result: {
      success: true,
      summary: 'Updated main.scad',
      __checkpointId: 'cp-123',
    },
    state: 'completed',
    timestamp: 1,
  };
}

function createPendingToolCall(): ToolCall {
  return {
    toolCallId: 'tool-2',
    name: 'read_file',
    args: {
      path: 'lib.scad',
    },
    state: 'pending',
  };
}

function createScreenshotToolMessage(): Message {
  return {
    type: 'tool-call',
    id: 'message-2',
    toolCallId: 'tool-2',
    toolName: 'get_preview_screenshot',
    args: {
      view: 'front',
    },
    result: {
      image_data_url: 'data:image/png;base64,AAA=',
    },
    state: 'completed',
    timestamp: 2,
  };
}

function createUserMessage(): Message {
  return {
    type: 'user',
    id: 'user-1',
    timestamp: 0,
    parts: [{ type: 'text', text: 'Inspect the project files.' }],
  };
}

function installScrollMetrics(
  element: HTMLElement,
  {
    scrollTop = 0,
    clientHeight = 240,
    scrollHeight = 1000,
  }: { scrollTop?: number; clientHeight?: number; scrollHeight?: number } = {}
) {
  let currentScrollTop = scrollTop;
  let currentScrollHeight = scrollHeight;
  let currentClientHeight = clientHeight;

  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => currentScrollTop,
    set: (value: number) => {
      currentScrollTop = value;
    },
  });

  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => currentScrollHeight,
  });

  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => currentClientHeight,
  });

  return {
    getScrollTop: () => currentScrollTop,
    setScrollTop: (value: number) => {
      currentScrollTop = value;
    },
    setScrollHeight: (value: number) => {
      currentScrollHeight = value;
    },
    setClientHeight: (value: number) => {
      currentClientHeight = value;
    },
  };
}

describe('AiPromptPanel', () => {
  beforeAll(async () => {
    ({ AiPromptPanel } = await import('@/components/AiPromptPanel'));
  });

  it('keeps completed tool payloads collapsed until expanded', () => {
    renderWithProviders(
      <AiPromptPanel {...createBaseProps({ messages: [createCompletedToolMessage()] })} />
    );

    expect(screen.queryByText(/"path": "main\.scad"/)).toBeNull();
    expect(screen.queryByText(/"summary": "Updated main\.scad"/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /expand details for apply_edit/i }));

    expect(screen.getByText(/"path": "main\.scad"/)).toBeTruthy();
    expect(screen.getByText(/"newString": "cube\(2\);"/)).toBeTruthy();
    expect(screen.getByText(/"success": true/)).toBeTruthy();
    expect(screen.getByText(/"summary": "Updated main\.scad"/)).toBeTruthy();
    expect(screen.queryByText(/rationale/i)).toBeNull();
    expect(screen.queryByText(/checkpoint/i)).toBeNull();
  });

  it('shows pending tool inputs and a waiting placeholder when the result is not available yet', () => {
    renderWithProviders(
      <AiPromptPanel
        {...createBaseProps({
          messages: [createUserMessage()],
          currentToolCalls: [createPendingToolCall()],
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /expand details for read_file/i }));

    expect(screen.getByText(/"path": "lib\.scad"/)).toBeTruthy();
    expect(screen.getByText('Waiting for result...')).toBeTruthy();
  });

  it('keeps screenshot thumbnails visible while the raw screenshot payload stays collapsed', () => {
    renderWithProviders(
      <AiPromptPanel {...createBaseProps({ messages: [createScreenshotToolMessage()] })} />
    );

    expect(screen.getByText('Preview screenshot')).toBeTruthy();
    expect(screen.queryByText(/"view": "front"/)).toBeNull();
    expect(screen.queryByText(/image_data_url/i)).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: /expand details for get_preview_screenshot/i })
    );

    expect(screen.getByText(/"view": "front"/)).toBeTruthy();
    expect(screen.getByText(/image_data_url/i)).toBeTruthy();
  });

  it('keeps auto-scrolling while the transcript is pinned to the bottom', () => {
    const props = createBaseProps({
      messages: [createUserMessage()],
      streamingResponse: 'Working',
      isStreaming: true,
    });

    const { rerender } = renderWithProviders(<AiPromptPanel {...props} />);
    const transcript = screen.getByTestId('ai-transcript');
    const scrollMetrics = installScrollMetrics(transcript, {
      scrollTop: 760,
      clientHeight: 240,
      scrollHeight: 1000,
    });

    fireEvent.scroll(transcript);

    scrollMetrics.setScrollHeight(1240);
    rerender(<AiPromptPanel {...props} streamingResponse="Working a bit more" />);

    expect(scrollMetrics.getScrollTop()).toBe(1240);
    expect(screen.queryByTestId('ai-scroll-to-latest')).toBeNull();
  });

  it('lets the user pause auto-scroll while streaming and jump back to the latest response', () => {
    const props = createBaseProps({
      messages: [createUserMessage()],
      streamingResponse: 'Working',
      isStreaming: true,
    });

    const { rerender } = renderWithProviders(<AiPromptPanel {...props} />);
    const transcript = screen.getByTestId('ai-transcript');
    const scrollMetrics = installScrollMetrics(transcript, {
      scrollTop: 760,
      clientHeight: 240,
      scrollHeight: 1000,
    });

    fireEvent.scroll(transcript);

    scrollMetrics.setScrollTop(320);
    fireEvent.scroll(transcript);

    scrollMetrics.setScrollHeight(1320);
    rerender(<AiPromptPanel {...props} streamingResponse="Working a bit more" />);

    expect(scrollMetrics.getScrollTop()).toBe(320);

    fireEvent.click(screen.getByTestId('ai-scroll-to-latest'));

    expect(scrollMetrics.getScrollTop()).toBe(1320);
    expect(screen.queryByTestId('ai-scroll-to-latest')).toBeNull();
  });
});
