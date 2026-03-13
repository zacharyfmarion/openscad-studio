/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { WelcomeScreen } from '../WelcomeScreen';
import { clearApiKey, storeApiKey } from '../../stores/apiKeyStore';

const mockGetPlatform = jest.fn();

jest.mock('../../platform', () => ({
  getPlatform: () => mockGetPlatform(),
}));

function createJsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('WelcomeScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    clearApiKey('anthropic');
    clearApiKey('openai');
    storeApiKey('openai', 'openai-test-key');
    mockGetPlatform.mockReturnValue({
      capabilities: { hasFileSystem: false },
      fileExists: jest.fn(async () => false),
    });

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: jest.fn(async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url.includes('api.openai.com')) {
          return createJsonResponse({
            data: [{ id: 'gpt-5.4' }, { id: 'gpt-5' }],
          });
        }

        return createJsonResponse({ data: [], has_more: false });
      }),
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows the model selector inline with the welcome composer actions when an API key is configured', async () => {
    render(
      <WelcomeScreen
        draft={{ text: '', attachmentIds: [] }}
        attachments={{}}
        draftErrors={[]}
        canSubmitDraft={false}
        isProcessingAttachments={false}
        onDraftTextChange={() => {}}
        onDraftFilesSelected={() => {}}
        onDraftRemoveAttachment={() => {}}
        onStartWithDraft={() => {}}
        onStartManually={() => {}}
        onOpenRecent={async () => 'opened'}
        currentModel="gpt-5.4"
        availableProviders={['openai']}
        onModelChange={() => {}}
        showRecentFiles={false}
      />
    );

    expect(screen.getByTestId('welcome-ai-entry').className).toContain('ph-no-capture');
    expect(await screen.findByRole('combobox')).toBeTruthy();
    expect(await screen.findByRole('option', { name: 'GPT-5.4' })).toBeTruthy();
  });

  it('prunes missing recent files before rendering them', async () => {
    localStorage.setItem(
      'openscad-studio-recent-files',
      JSON.stringify([
        { path: '/tmp/exists.scad', name: 'exists.scad', lastOpened: 2 },
        { path: '/tmp/missing.scad', name: 'missing.scad', lastOpened: 3 },
      ])
    );

    mockGetPlatform.mockReturnValue({
      capabilities: { hasFileSystem: true },
      fileExists: jest.fn(async (path: string) => path === '/tmp/exists.scad'),
    });

    render(
      <WelcomeScreen
        draft={{ text: '', attachmentIds: [] }}
        attachments={{}}
        draftErrors={[]}
        canSubmitDraft={false}
        isProcessingAttachments={false}
        onDraftTextChange={() => {}}
        onDraftFilesSelected={() => {}}
        onDraftRemoveAttachment={() => {}}
        onStartWithDraft={() => {}}
        onStartManually={() => {}}
        onOpenRecent={async () => 'opened'}
      />
    );

    expect(await screen.findByText('exists.scad')).toBeTruthy();
    expect(screen.queryByText('missing.scad')).toBeNull();
    expect(JSON.parse(localStorage.getItem('openscad-studio-recent-files') || '[]')).toEqual([
      { path: '/tmp/exists.scad', name: 'exists.scad', lastOpened: 2 },
    ]);
  });
});
