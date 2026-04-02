/** @jest-environment jsdom */

import { screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { clearApiKey, storeApiKey } from '../../stores/apiKeyStore';
import { renderWithProviders } from './test-utils';

const mockGetPlatform = jest.fn();

jest.unstable_mockModule('@/platform', () => ({
  getPlatform: () => mockGetPlatform(),
}));

let WelcomeScreen: typeof import('../WelcomeScreen').WelcomeScreen;

function createJsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('WelcomeScreen', () => {
  beforeAll(async () => {
    ({ WelcomeScreen } = await import('../WelcomeScreen'));
  });

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
    renderWithProviders(
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
    const combobox = await screen.findByRole('combobox');
    expect(combobox).toBeTruthy();
    await waitFor(() => {
      expect(combobox.textContent).toContain('GPT-5.4');
    });
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

    renderWithProviders(
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

  it('keeps the desktop no-key welcome state focused on API key setup only', async () => {
    clearApiKey('openai');
    clearApiKey('anthropic');
    mockGetPlatform.mockReturnValue({
      capabilities: { hasFileSystem: true },
      fileExists: jest.fn(async () => false),
    });

    renderWithProviders(
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
        onOpenSettings={() => {}}
        showRecentFiles={false}
      />
    );

    expect(screen.getByText('Set up an API key to use the AI assistant')).toBeTruthy();
    expect(screen.queryByText('Claude Code')).toBeNull();
  });
});
