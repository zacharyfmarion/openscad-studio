/** @jest-environment jsdom */

import { act, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import {
  storeApiKey,
  invalidateApiKeyStatus,
  setStoredModel,
  getStoredModel,
} from '../../stores/apiKeyStore';
import {
  getUserMessageText,
  type AttachmentRecord,
  type Message,
  type UserMessage,
} from '../../types/aiChat';
import { useAiAgent } from '../useAiAgent';
import {
  createAnalyticsSpy,
  createHookHarness,
  createStreamResult,
  type StreamChunk,
} from './test-utils';

function createReadyAttachment(
  id: string,
  overrides: Partial<AttachmentRecord> = {}
): AttachmentRecord {
  return {
    id,
    filename: `${id}.png`,
    sourceMimeType: 'image/png',
    normalizedMimeType: 'image/png',
    sizeBytes: 128,
    width: 64,
    height: 64,
    previewUrl: `blob:${id}`,
    normalizedData: 'abc123',
    status: 'ready',
    dedupeKey: `${id}:128:1`,
    ...overrides,
  };
}

function createHarness(options?: Parameters<typeof useAiAgent>[0]) {
  return createHookHarness(() => useAiAgent(options));
}

describe('useAiAgent', () => {
  beforeEach(() => {
    localStorage.clear();
    invalidateApiKeyStatus();
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('falls back to a preferred provider model when the stored provider is unavailable', async () => {
    setStoredModel('gpt-5.4');
    const getPreferredDefaultModel = jest.fn(() => 'claude-sonnet-4-5');

    const hook = createHarness({
      testOverrides: {
        availableProviders: ['anthropic'],
        getPreferredDefaultModel: getPreferredDefaultModel as never,
        getVisionSupportForModelId: ((model: string) =>
          model === 'claude-sonnet-4-5' ? 'yes' : 'no') as never,
      },
    });

    await waitFor(() => {
      expect(hook.current().currentModel).toBe('claude-sonnet-4-5');
    });

    expect(hook.current().currentModelVisionSupport).toBe('yes');
    expect(getPreferredDefaultModel).toHaveBeenCalledWith(['anthropic']);
    expect(getStoredModel()).toBe('claude-sonnet-4-5');
  });

  it('exposes project-aware tool callbacks through the injected buildTools bridge', async () => {
    const updateSetting = jest.fn();
    const readDirectoryFiles = jest.fn(async () => ({
      'z.scad': 'module z() {}',
      'a.scad': 'module a() {}',
    }));
    const readTextFile = jest.fn(async (path: string) => `// file:${path}`);
    const getPlatform = jest.fn(
      () =>
        ({
          capabilities: { hasFileSystem: true },
          readDirectoryFiles,
          readTextFile,
        }) as never
    );
    let capturedCallbacks:
      | {
          getCurrentCode: () => string;
          captureCurrentView: () => Promise<string | null>;
          get3dPreviewUrl: () => string | null;
          getPreviewSceneStyle: () => unknown;
          getUseModelColors: () => boolean;
          hasProjectFileAccess: () => boolean;
          getCurrentFileRelativePath: () => string | null;
          listProjectFiles: () => Promise<string[] | null>;
          readProjectFile: (path: string) => Promise<string | null>;
          getMeasurementUnit: () => string;
          setMeasurementUnit: (unit: 'mm' | 'cm' | 'in' | 'units') => void;
        }
      | undefined;
    const buildTools = jest.fn((callbacks) => {
      capturedCallbacks = callbacks;
      return {};
    });

    const hook = createHarness({
      testOverrides: {
        availableProviders: ['anthropic'],
        buildTools: buildTools as never,
        getPlatform: getPlatform as never,
        updateSetting: updateSetting as never,
        loadSettings: (() => ({ viewer: { measurementUnit: 'cm' } })) as never,
      },
    });

    act(() => {
      hook.current().updateSourceRef('cube(42);');
      hook.current().updateCapturePreview(async () => 'data:image/png;base64,abc');
      hook.current().update3dPreviewUrl('blob:mesh');
      hook.current().updateWorkingDir('/project');
      hook.current().updateCurrentFilePath('/project/main.scad');
      hook.current().updatePreviewSceneStyle({ type: 'presentation' } as never);
      hook.current().updateUseModelColors(false);
    });

    expect(capturedCallbacks).toBeDefined();
    expect(capturedCallbacks!.getCurrentCode()).toBe('cube(42);');
    expect(await capturedCallbacks!.captureCurrentView()).toBe('data:image/png;base64,abc');
    expect(capturedCallbacks!.get3dPreviewUrl()).toBe('blob:mesh');
    expect(capturedCallbacks!.getPreviewSceneStyle()).toEqual({ type: 'presentation' });
    expect(capturedCallbacks!.getUseModelColors()).toBe(false);
    expect(capturedCallbacks!.hasProjectFileAccess()).toBe(true);
    expect(capturedCallbacks!.getCurrentFileRelativePath()).toBe('main.scad');
    expect(await capturedCallbacks!.listProjectFiles()).toEqual(['a.scad', 'z.scad']);
    expect(await capturedCallbacks!.readProjectFile('main.scad')).toBe('cube(42);');
    expect(await capturedCallbacks!.readProjectFile('./lib/util.scad')).toBe(
      '// file:/project/lib/util.scad'
    );
    expect(await capturedCallbacks!.readProjectFile('../escape.scad')).toBeNull();
    expect(capturedCallbacks!.getMeasurementUnit()).toBe('cm');

    act(() => {
      capturedCallbacks!.setMeasurementUnit('in');
    });

    expect(updateSetting).toHaveBeenCalledWith('viewer', { measurementUnit: 'in' });
    expect(readDirectoryFiles).toHaveBeenCalledWith('/project', ['scad'], true);
    expect(readTextFile).toHaveBeenCalledWith('/project/lib/util.scad');
  });

  it('handles missing project context gracefully when tool callbacks cannot access the filesystem', async () => {
    const buildTools = jest.fn((callbacks) => {
      expect(callbacks.hasProjectFileAccess()).toBe(false);
      return {};
    });

    const hook = createHarness({
      testOverrides: {
        availableProviders: ['anthropic'],
        buildTools: buildTools as never,
        getPlatform: (() => {
          throw new Error('platform unavailable');
        }) as never,
      },
    });

    expect(hook.current().availableProviders).toEqual(['anthropic']);
    expect(buildTools).toHaveBeenCalled();
  });

  it('surfaces a missing API key before attempting to stream a prompt', async () => {
    const startAiStream = jest.fn();
    const hook = createHarness({
      testOverrides: {
        availableProviders: ['anthropic'],
        startAiStream: startAiStream as never,
      },
    });

    await act(async () => {
      await hook.current().submitPrompt('Generate a bracket');
    });

    expect(startAiStream).not.toHaveBeenCalled();
    expect(hook.current().messages).toEqual([]);
    expect(hook.current().error).toBe('Please set your API key in Settings first');
  });

  it('adds attachments, exposes unknown-vision warnings, and cleans up previews when removing or clearing', async () => {
    const analytics = createAnalyticsSpy();
    const processAttachmentFiles = jest
      .fn()
      .mockResolvedValueOnce({
        attachments: [
          createReadyAttachment('att-1'),
          {
            id: 'att-2',
            filename: 'bad.png',
            sourceMimeType: 'image/png',
            sizeBytes: 10,
            status: 'error',
            errorMessage: 'bad image',
            dedupeKey: 'att-2:10:1',
          },
        ],
        errors: ['bad image'],
      })
      .mockResolvedValueOnce({
        attachments: [createReadyAttachment('att-3')],
        errors: [],
      });

    const hook = createHarness({
      testOverrides: {
        analytics: analytics as never,
        availableProviders: ['anthropic'],
        processAttachmentFiles: processAttachmentFiles as never,
        getVisionSupportForModelId: (() => 'unknown') as never,
      },
    });

    await act(async () => {
      await hook.current().addDraftFiles([new File(['one'], 'ref.png', { type: 'image/png' })]);
    });

    expect(hook.current().draft.attachmentIds).toEqual(['att-1', 'att-2']);
    expect(hook.current().draftErrors).toEqual(['bad image']);
    expect(hook.current().draftVisionWarningMessage).toContain('may reject image inputs');
    expect(hook.current().canSubmitDraft).toBe(true);

    act(() => {
      hook.current().removeDraftAttachment('att-1');
    });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:att-1');
    expect(hook.current().draft.attachmentIds).toEqual(['att-2']);

    await act(async () => {
      await hook.current().addDraftFiles([new File(['two'], 'ref-2.png', { type: 'image/png' })]);
    });

    expect(hook.current().draft.attachmentIds).toEqual(['att-2', 'att-3']);

    act(() => {
      hook.current().clearDraft();
    });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:att-3');
    expect(hook.current().draft).toEqual({ text: '', attachmentIds: [] });
    expect(hook.current().attachments).toEqual({});
    expect(analytics.track).toHaveBeenCalledWith(
      'attachment added',
      expect.objectContaining({ ready_count: 1, error_count: 1 })
    );
    expect(analytics.track).toHaveBeenCalledWith(
      'attachment removed',
      expect.objectContaining({ source_surface: 'unknown' })
    );
  });

  it('blocks attachment-only submits when the selected model has no vision support', async () => {
    const startAiStream = jest.fn();
    const hook = createHarness({
      testOverrides: {
        availableProviders: ['anthropic'],
        startAiStream: startAiStream as never,
        processAttachmentFiles: (async () => ({
          attachments: [createReadyAttachment('att-1')],
          errors: [],
        })) as never,
        getVisionSupportForModelId: (() => 'no') as never,
      },
    });

    await act(async () => {
      await hook.current().addDraftFiles([new File(['one'], 'ref.png', { type: 'image/png' })]);
    });

    await act(async () => {
      await hook.current().submitDraft();
    });

    expect(startAiStream).not.toHaveBeenCalled();
    expect(hook.current().draftErrors[0]).toContain('does not support image inputs');
  });

  it('prepends annotation guidance when submitting viewer annotation attachments', async () => {
    storeApiKey('anthropic', 'test-key');
    const messagesToModelMessages = jest.fn(() => []);
    const startAiStream = jest.fn(async () =>
      createStreamResult([
        {
          type: 'finish',
          finishReason: 'stop',
          rawFinishReason: 'stop',
          totalUsage: {} as never,
        },
      ] satisfies StreamChunk[])
    );

    const hook = createHarness({
      testOverrides: {
        availableProviders: ['anthropic'],
        createModel: (() => ({ id: 'model' })) as never,
        buildTools: (() => ({})) as never,
        messagesToModelMessages: messagesToModelMessages as never,
        startAiStream: startAiStream as never,
        processAttachmentFiles: (async (_files, _draft, _attachments, sourceSurface) => ({
          attachments: [createReadyAttachment('att-annotated', { sourceSurface })],
          errors: [],
        })) as never,
      },
    });

    await act(async () => {
      await hook
        .current()
        .addDraftFiles(
          [new File(['one'], 'annotated.png', { type: 'image/png' })],
          'viewer_annotation'
        );
    });

    act(() => {
      hook.current().setDraftText('Help me fix this face.');
    });

    await act(async () => {
      await hook.current().submitDraft();
    });

    await waitFor(() => {
      expect(hook.current().isStreaming).toBe(false);
    });

    const userMessage = hook.current().messages[0] as UserMessage;
    expect(userMessage).toMatchObject({ type: 'user' });
    expect(getUserMessageText(userMessage)).toContain('intentional user annotations');
    expect(getUserMessageText(userMessage)).toContain('Help me fix this face.');
    expect(userMessage.parts[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('intentional user annotations'),
    });
  });

  it('does not inject annotation guidance for normal image attachments', async () => {
    storeApiKey('anthropic', 'test-key');

    const hook = createHarness({
      testOverrides: {
        availableProviders: ['anthropic'],
        createModel: (() => ({ id: 'model' })) as never,
        buildTools: (() => ({})) as never,
        messagesToModelMessages: (() => []) as never,
        startAiStream: (async () =>
          createStreamResult([
            {
              type: 'finish',
              finishReason: 'stop',
              rawFinishReason: 'stop',
              totalUsage: {} as never,
            },
          ] satisfies StreamChunk[])) as never,
        processAttachmentFiles: (async (_files, _draft, _attachments, sourceSurface) => ({
          attachments: [createReadyAttachment('att-normal', { sourceSurface })],
          errors: [],
        })) as never,
      },
    });

    await act(async () => {
      await hook.current().addDraftFiles([new File(['one'], 'ref.png', { type: 'image/png' })]);
    });

    await act(async () => {
      await hook.current().submitDraft();
    });

    await waitFor(() => {
      expect(hook.current().isStreaming).toBe(false);
    });

    const userMessage = hook.current().messages[0] as UserMessage;
    expect(userMessage.parts).toHaveLength(1);
    expect(userMessage.parts[0]).toMatchObject({ type: 'image' });
  });

  it('adds annotation guidance only once for mixed attachment sources and still works without user text', async () => {
    storeApiKey('anthropic', 'test-key');
    let nextId = 1;

    const hook = createHarness({
      testOverrides: {
        availableProviders: ['anthropic'],
        createModel: (() => ({ id: 'model' })) as never,
        buildTools: (() => ({})) as never,
        messagesToModelMessages: (() => []) as never,
        startAiStream: (async () =>
          createStreamResult([
            {
              type: 'finish',
              finishReason: 'stop',
              rawFinishReason: 'stop',
              totalUsage: {} as never,
            },
          ] satisfies StreamChunk[])) as never,
        processAttachmentFiles: (async (_files, _draft, _attachments, sourceSurface) => ({
          attachments: [
            createReadyAttachment(`att-${nextId++}`, {
              sourceSurface,
            }),
          ],
          errors: [],
        })) as never,
      },
    });

    await act(async () => {
      await hook
        .current()
        .addDraftFiles(
          [new File(['one'], 'annotated.png', { type: 'image/png' })],
          'viewer_annotation'
        );
      await hook.current().addDraftFiles([new File(['two'], 'ref.png', { type: 'image/png' })]);
    });

    await act(async () => {
      await hook.current().submitDraft();
    });

    await waitFor(() => {
      expect(hook.current().isStreaming).toBe(false);
    });

    const userMessage = hook.current().messages[0] as UserMessage;
    const textParts = userMessage.parts.filter((part) => part.type === 'text');

    expect(textParts).toHaveLength(1);
    expect(textParts[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('intentional user annotations'),
    });
    expect(userMessage.parts.filter((part) => part.type === 'image')).toHaveLength(2);
  });

  it('completes a successful stream and persists the assistant response', async () => {
    storeApiKey('anthropic', 'test-key');
    const analytics = createAnalyticsSpy();
    const createModel = jest.fn(() => ({ id: 'model' }));
    const messagesToModelMessages = jest.fn(() => []);
    const startAiStream = jest.fn(async () =>
      createStreamResult([
        { type: 'start-step', request: {} as never, warnings: [] },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', text: 'Done.' },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish-step',
          response: {} as never,
          usage: {} as never,
          finishReason: 'stop',
          rawFinishReason: 'stop',
          providerMetadata: undefined,
        },
        {
          type: 'finish',
          finishReason: 'stop',
          rawFinishReason: 'stop',
          totalUsage: {} as never,
        },
      ] satisfies StreamChunk[])
    );

    const hook = createHarness({
      testOverrides: {
        analytics: analytics as never,
        availableProviders: ['anthropic'],
        createModel: createModel as never,
        buildTools: (() => ({})) as never,
        messagesToModelMessages: messagesToModelMessages as never,
        startAiStream: startAiStream as never,
      },
    });

    await act(async () => {
      await hook.current().submitPrompt('Make a cube');
    });

    await waitFor(() => {
      expect(hook.current().isStreaming).toBe(false);
    });

    expect(createModel).toHaveBeenCalledWith('anthropic', 'test-key', hook.current().currentModel);
    expect(messagesToModelMessages).toHaveBeenCalled();
    expect(hook.current().messages).toHaveLength(2);
    expect(hook.current().messages[1]).toMatchObject({
      type: 'assistant',
      content: 'Done.',
      state: 'complete',
    });
    expect(analytics.track).toHaveBeenCalledWith(
      'ai request completed',
      expect.objectContaining({
        provider: 'anthropic',
        finish_reason: 'complete',
        had_error: false,
      })
    );
  });

  it('restores the submitted draft when the request fails before any response arrives', async () => {
    storeApiKey('anthropic', 'test-key');

    const hook = createHarness({
      testOverrides: {
        availableProviders: ['anthropic'],
        createModel: (() => ({ id: 'model' })) as never,
        buildTools: (() => ({})) as never,
        messagesToModelMessages: (() => []) as never,
        startAiStream: (async () => {
          throw new Error('Failed to fetch');
        }) as never,
      },
    });

    await act(async () => {
      await hook.current().submitPrompt('Restore this prompt');
    });

    await waitFor(() => {
      expect(hook.current().isStreaming).toBe(false);
    });

    expect(hook.current().error).toBe(
      'Could not reach the AI service — check your internet connection.'
    );
    expect(hook.current().draft.text).toBe('Restore this prompt');
  });

  it('records streamed tool checkpoints and non-fetch stream errors after a partial response', async () => {
    storeApiKey('anthropic', 'test-key');

    const hook = createHarness({
      testOverrides: {
        availableProviders: ['anthropic'],
        createModel: (() => ({ id: 'model' })) as never,
        buildTools: (() => ({})) as never,
        messagesToModelMessages: (() => []) as never,
        startAiStream: (async () =>
          createStreamResult([
            { type: 'text-start', id: 'text-1' },
            { type: 'text-delta', id: 'text-1', text: 'Partial reply' },
            { type: 'tool-input-start', id: 'tool-1', toolName: 'apply_edit' },
            {
              type: 'tool-call',
              toolCallId: 'tool-1',
              toolName: 'apply_edit',
              input: {},
            } as StreamChunk,
            {
              type: 'tool-result',
              toolCallId: 'tool-1',
              toolName: 'apply_edit',
              input: {},
              output: 'Applied [CHECKPOINT:cp-123]',
            } as StreamChunk,
            {
              type: 'error',
              error: { message: 'Worker exploded' },
            } as StreamChunk,
          ])) as never,
      },
    });

    await act(async () => {
      await hook.current().submitPrompt('Patch the file');
    });

    await waitFor(() => {
      expect(hook.current().isStreaming).toBe(false);
    });

    expect(hook.current().error).toBe('Failed: Worker exploded');
    expect(hook.current().draft.text).toBe('');
    expect(hook.current().messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'user',
          checkpointId: 'cp-123',
        }),
        expect.objectContaining({
          type: 'tool-call',
          toolCallId: 'tool-1',
          toolName: 'apply_edit',
          state: 'completed',
          result: 'Applied [CHECKPOINT:cp-123]',
        }),
      ])
    );
  });

  it('keeps the first checkpoint id when a turn applies multiple edits', async () => {
    storeApiKey('anthropic', 'test-key');

    const hook = createHarness({
      testOverrides: {
        availableProviders: ['anthropic'],
        createModel: (() => ({ id: 'model' })) as never,
        buildTools: (() => ({})) as never,
        messagesToModelMessages: (() => []) as never,
        startAiStream: (async () =>
          createStreamResult([
            { type: 'tool-input-start', id: 'tool-1', toolName: 'apply_edit' },
            {
              type: 'tool-call',
              toolCallId: 'tool-1',
              toolName: 'apply_edit',
              input: {},
            } as StreamChunk,
            {
              type: 'tool-result',
              toolCallId: 'tool-1',
              toolName: 'apply_edit',
              input: {},
              output: 'Applied [CHECKPOINT:cp-1]',
            } as StreamChunk,
            { type: 'tool-input-start', id: 'tool-2', toolName: 'apply_edit' },
            {
              type: 'tool-call',
              toolCallId: 'tool-2',
              toolName: 'apply_edit',
              input: {},
            } as StreamChunk,
            {
              type: 'tool-result',
              toolCallId: 'tool-2',
              toolName: 'apply_edit',
              input: {},
              output: 'Applied [CHECKPOINT:cp-2]',
            } as StreamChunk,
            {
              type: 'finish',
              finishReason: 'stop',
              rawFinishReason: 'stop',
              totalUsage: {} as never,
            },
          ] satisfies StreamChunk[])) as never,
      },
    });

    await act(async () => {
      await hook.current().submitPrompt('Patch the file twice');
    });

    await waitFor(() => {
      expect(hook.current().isStreaming).toBe(false);
    });

    expect(hook.current().messages[0]).toMatchObject({
      type: 'user',
      checkpointId: 'cp-1',
    });
  });

  it('ignores malformed later checkpoint results after a valid first edit', async () => {
    storeApiKey('anthropic', 'test-key');

    const hook = createHarness({
      testOverrides: {
        availableProviders: ['anthropic'],
        createModel: (() => ({ id: 'model' })) as never,
        buildTools: (() => ({})) as never,
        messagesToModelMessages: (() => []) as never,
        startAiStream: (async () =>
          createStreamResult([
            { type: 'tool-input-start', id: 'tool-1', toolName: 'apply_edit' },
            {
              type: 'tool-call',
              toolCallId: 'tool-1',
              toolName: 'apply_edit',
              input: {},
            } as StreamChunk,
            {
              type: 'tool-result',
              toolCallId: 'tool-1',
              toolName: 'apply_edit',
              input: {},
              output: 'Applied [CHECKPOINT:cp-1]',
            } as StreamChunk,
            { type: 'tool-input-start', id: 'tool-2', toolName: 'apply_edit' },
            {
              type: 'tool-call',
              toolCallId: 'tool-2',
              toolName: 'apply_edit',
              input: {},
            } as StreamChunk,
            {
              type: 'tool-result',
              toolCallId: 'tool-2',
              toolName: 'apply_edit',
              input: {},
              output: 'Applied but missing checkpoint token',
            } as StreamChunk,
            {
              type: 'finish',
              finishReason: 'stop',
              rawFinishReason: 'stop',
              totalUsage: {} as never,
            },
          ] satisfies StreamChunk[])) as never,
      },
    });

    await act(async () => {
      await hook.current().submitPrompt('Patch the file twice');
    });

    await waitFor(() => {
      expect(hook.current().isStreaming).toBe(false);
    });

    expect(hook.current().messages[0]).toMatchObject({
      type: 'user',
      checkpointId: 'cp-1',
    });
  });

  it('preserves the first checkpoint when a later edit in the turn errors', async () => {
    storeApiKey('anthropic', 'test-key');

    const hook = createHarness({
      testOverrides: {
        availableProviders: ['anthropic'],
        createModel: (() => ({ id: 'model' })) as never,
        buildTools: (() => ({})) as never,
        messagesToModelMessages: (() => []) as never,
        startAiStream: (async () =>
          createStreamResult([
            { type: 'tool-input-start', id: 'tool-1', toolName: 'apply_edit' },
            {
              type: 'tool-call',
              toolCallId: 'tool-1',
              toolName: 'apply_edit',
              input: {},
            } as StreamChunk,
            {
              type: 'tool-result',
              toolCallId: 'tool-1',
              toolName: 'apply_edit',
              input: {},
              output: 'Applied [CHECKPOINT:cp-1]',
            } as StreamChunk,
            { type: 'tool-input-start', id: 'tool-2', toolName: 'apply_edit' },
            {
              type: 'tool-call',
              toolCallId: 'tool-2',
              toolName: 'apply_edit',
              input: {},
            } as StreamChunk,
            {
              type: 'tool-error',
              toolCallId: 'tool-2',
              toolName: 'apply_edit',
              input: {},
              error: { message: 'Second edit failed' },
            } as StreamChunk,
            {
              type: 'error',
              error: { message: 'Worker exploded' },
            } as StreamChunk,
          ] satisfies StreamChunk[])) as never,
      },
    });

    await act(async () => {
      await hook.current().submitPrompt('Patch the file twice');
    });

    await waitFor(() => {
      expect(hook.current().isStreaming).toBe(false);
    });

    expect(hook.current().messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'user',
          checkpointId: 'cp-1',
        }),
        expect.objectContaining({
          type: 'tool-call',
          toolCallId: 'tool-2',
          toolName: 'apply_edit',
          state: 'error',
        }),
      ])
    );
  });

  it('restores the first checkpoint for multi-edit turns and truncates later conversation', async () => {
    storeApiKey('anthropic', 'test-key');
    const analytics = createAnalyticsSpy();
    const history = { restoreTo: jest.fn(() => ({ code: 'cube(1);' })) };
    const eventBus = { emit: jest.fn() };

    const hook = createHarness({
      testOverrides: {
        analytics: analytics as never,
        availableProviders: ['anthropic'],
        createModel: (() => ({ id: 'model' })) as never,
        buildTools: (() => ({})) as never,
        messagesToModelMessages: (() => []) as never,
        startAiStream: (async () =>
          createStreamResult([
            { type: 'tool-input-start', id: 'tool-1', toolName: 'apply_edit' },
            {
              type: 'tool-call',
              toolCallId: 'tool-1',
              toolName: 'apply_edit',
              input: {},
            } as StreamChunk,
            {
              type: 'tool-result',
              toolCallId: 'tool-1',
              toolName: 'apply_edit',
              input: {},
              output: 'Applied [CHECKPOINT:cp-1]',
            } as StreamChunk,
            { type: 'tool-input-start', id: 'tool-2', toolName: 'apply_edit' },
            {
              type: 'tool-call',
              toolCallId: 'tool-2',
              toolName: 'apply_edit',
              input: {},
            } as StreamChunk,
            {
              type: 'tool-result',
              toolCallId: 'tool-2',
              toolName: 'apply_edit',
              input: {},
              output: 'Applied [CHECKPOINT:cp-2]',
            } as StreamChunk,
            { type: 'text-start', id: 'text-1' },
            { type: 'text-delta', id: 'text-1', text: 'Done.' },
            {
              type: 'finish',
              finishReason: 'stop',
              rawFinishReason: 'stop',
              totalUsage: {} as never,
            },
          ] satisfies StreamChunk[])) as never,
        historyService: history as never,
        eventBus: eventBus as never,
      },
    });

    await act(async () => {
      await hook.current().submitPrompt('Create a part');
    });

    await waitFor(() => {
      expect(hook.current().messages).toHaveLength(4);
    });

    const truncatedMessages = [hook.current().messages[0]];
    expect(hook.current().messages[0]).toMatchObject({
      type: 'user',
      checkpointId: 'cp-1',
    });

    act(() => {
      hook.current().handleRestoreCheckpoint('cp-1', truncatedMessages);
    });

    expect(history.restoreTo).toHaveBeenCalledWith('cp-1');
    expect(eventBus.emit).toHaveBeenCalledWith('code-updated', {
      code: 'cube(1);',
      source: 'history',
    });
    expect(hook.current().messages).toEqual(truncatedMessages);
    expect(analytics.track).toHaveBeenCalledWith(
      'checkpoint restored',
      expect.objectContaining({ had_later_messages: true })
    );
  });

  it('marks partial responses as cancelled when the stream is aborted by the user', async () => {
    storeApiKey('anthropic', 'test-key');
    const analytics = createAnalyticsSpy();

    const startAiStream = jest.fn(async ({ abortSignal }: { abortSignal: AbortSignal }) => ({
      fullStream: (async function* () {
        yield { type: 'text-start', id: 'text-1' };
        yield { type: 'text-delta', id: 'text-1', text: 'Working' };
        await new Promise<void>((resolve) => {
          abortSignal.addEventListener('abort', () => resolve(), { once: true });
        });
      })(),
    }));

    const hook = createHarness({
      testOverrides: {
        analytics: analytics as never,
        availableProviders: ['anthropic'],
        createModel: (() => ({ id: 'model' })) as never,
        buildTools: (() => ({})) as never,
        messagesToModelMessages: (() => []) as never,
        startAiStream: startAiStream as never,
      },
    });

    act(() => {
      void hook.current().submitPrompt('Start rendering');
    });

    await waitFor(() => {
      expect(hook.current().streamingResponse).toBe('Working');
    });

    act(() => {
      hook.current().cancelStream();
    });

    await waitFor(() => {
      expect(hook.current().isStreaming).toBe(false);
    });

    expect(hook.current().messages[1]).toMatchObject({
      type: 'assistant',
      content: 'Working',
      state: 'cancelled',
    });
    expect(analytics.track).toHaveBeenCalledWith(
      'ai request cancelled',
      expect.objectContaining({
        provider: 'anthropic',
      })
    );
  });

  it('adds a completion notice when the stream stops because the tool step budget was exhausted', async () => {
    storeApiKey('anthropic', 'test-key');

    const hook = createHarness({
      testOverrides: {
        availableProviders: ['anthropic'],
        createModel: (() => ({ id: 'model' })) as never,
        buildTools: (() => ({})) as never,
        messagesToModelMessages: (() => []) as never,
        startAiStream: (async () =>
          createStreamResult([
            { type: 'text-start', id: 'text-1' },
            { type: 'text-delta', id: 'text-1', text: 'I used the tools.' },
            {
              type: 'finish',
              finishReason: 'tool-calls',
              rawFinishReason: 'tool-calls',
              totalUsage: {} as never,
            },
          ] satisfies StreamChunk[])) as never,
      },
    });

    await act(async () => {
      await hook.current().submitPrompt('Use every tool');
    });

    await waitFor(() => {
      expect(hook.current().isStreaming).toBe(false);
    });

    expect(hook.current().messages).toHaveLength(3);
    expect(hook.current().messages[1]).toMatchObject({
      type: 'assistant',
      content: 'I used the tools.',
    });
    expect(hook.current().messages[2]).toMatchObject({
      type: 'assistant',
    });
    expect((hook.current().messages[2] as Message & { content: string }).content).toContain(
      'tool step budget'
    );
  });

  it('restores checkpoints through the injected history and event services', async () => {
    storeApiKey('anthropic', 'test-key');
    const analytics = createAnalyticsSpy();
    const history = { restoreTo: jest.fn(() => ({ code: 'cube(42);' })) };
    const eventBus = { emit: jest.fn() };

    const hook = createHarness({
      testOverrides: {
        analytics: analytics as never,
        availableProviders: ['anthropic'],
        createModel: (() => ({ id: 'model' })) as never,
        buildTools: (() => ({})) as never,
        messagesToModelMessages: (() => []) as never,
        startAiStream: (async () =>
          createStreamResult([
            { type: 'text-start', id: 'text-1' },
            { type: 'text-delta', id: 'text-1', text: 'Done.' },
            {
              type: 'finish',
              finishReason: 'stop',
              rawFinishReason: 'stop',
              totalUsage: {} as never,
            },
          ] satisfies StreamChunk[])) as never,
        historyService: history as never,
        eventBus: eventBus as never,
      },
    });

    await act(async () => {
      await hook.current().submitPrompt('Create a part');
    });

    await waitFor(() => {
      expect(hook.current().messages).toHaveLength(2);
    });

    const truncatedMessages = [hook.current().messages[0]];

    act(() => {
      hook.current().handleRestoreCheckpoint('checkpoint-1', truncatedMessages);
    });

    expect(history.restoreTo).toHaveBeenCalledWith('checkpoint-1');
    expect(eventBus.emit).toHaveBeenCalledWith('code-updated', {
      code: 'cube(42);',
      source: 'history',
    });
    expect(eventBus.emit).toHaveBeenCalledWith('history:restore', { code: 'cube(42);' });
    expect(hook.current().messages).toEqual(truncatedMessages);
    expect(analytics.track).toHaveBeenCalledWith(
      'checkpoint restored',
      expect.objectContaining({ had_later_messages: true })
    );
  });

  it('supports clearing errors, resetting conversations, cancelling idle streams, and cleaning up on unmount', async () => {
    const analytics = createAnalyticsSpy();

    const hook = createHarness({
      testOverrides: {
        analytics: analytics as never,
        availableProviders: ['anthropic'],
        processAttachmentFiles: (async () => ({
          attachments: [createReadyAttachment('att-1')],
          errors: [],
        })) as never,
        getVisionSupportForModelId: (() => 'yes') as never,
      },
    });

    await act(async () => {
      await hook.current().addDraftFiles([new File(['one'], 'ref.png', { type: 'image/png' })]);
    });

    act(() => {
      hook.current().setDraftText('Unsaved prompt');
    });
    expect(hook.current().draft.text).toBe('Unsaved prompt');

    act(() => {
      hook.current().setDraft({ text: 'Kept', attachmentIds: [] });
    });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:att-1');
    expect(hook.current().draft).toEqual({ text: 'Kept', attachmentIds: [] });
    expect(hook.current().attachments).toEqual({});

    act(() => {
      hook.current().cancelStream();
    });

    act(() => {
      hook.current().setCurrentModel('gpt-5.4', 'settings_dialog');
    });

    expect(hook.current().currentModel).toBe('gpt-5.4');
    expect(getStoredModel()).toBe('gpt-5.4');

    act(() => {
      hook.current().clearError();
      hook.current().newConversation();
    });

    expect(hook.current().messages).toEqual([]);
    expect(hook.current().draft).toEqual({ text: '', attachmentIds: [] });
    expect(analytics.track).toHaveBeenCalledWith(
      'model selected',
      expect.objectContaining({ model_id: 'gpt-5.4', provider: 'openai' })
    );
    expect(analytics.track).toHaveBeenCalledWith(
      'conversation started',
      expect.objectContaining({
        had_draft_text: true,
      })
    );

    hook.unmount();
  });

  it('logs restore failures without emitting history events when a checkpoint is missing', () => {
    const analytics = createAnalyticsSpy();
    const history = { restoreTo: jest.fn(() => null) };
    const eventBus = { emit: jest.fn() };

    const hook = createHarness({
      testOverrides: {
        analytics: analytics as never,
        availableProviders: ['anthropic'],
        historyService: history as never,
        eventBus: eventBus as never,
      },
    });

    act(() => {
      hook.current().handleRestoreCheckpoint('missing', []);
    });

    expect(history.restoreTo).toHaveBeenCalledWith('missing');
    expect(eventBus.emit).not.toHaveBeenCalled();
    expect(analytics.track).toHaveBeenCalledWith(
      'checkpoint restored',
      expect.objectContaining({ had_later_messages: false })
    );
  });
});
