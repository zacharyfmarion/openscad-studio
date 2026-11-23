/** @jest-environment jsdom */

import { jest } from '@jest/globals';

const mockInvoke = jest.fn<(command: string) => Promise<unknown>>();
const mockAsk = jest.fn<() => Promise<boolean>>();
const mockUpdateSetting = jest.fn();
let mockUiSettings: { hasCompletedNux: boolean; hasAnsweredDefaultScadHandlerPrompt: boolean };
let mockHandlerStatus: { supported: boolean; isDefault: boolean };

const platformModule = new URL('../../platform/index.ts', import.meta.url).pathname;
const settingsStoreModule = new URL('../../stores/settingsStore.ts', import.meta.url).pathname;

jest.unstable_mockModule('@tauri-apps/api/core', () => ({
  invoke: (command: string) => mockInvoke(command),
}));

jest.unstable_mockModule(platformModule, () => ({
  getPlatform: () => ({
    capabilities: { hasFileSystem: true },
    ask: mockAsk,
  }),
}));

jest.unstable_mockModule(settingsStoreModule, () => ({
  loadSettings: () => ({ ui: mockUiSettings }),
  updateSetting: mockUpdateSetting,
}));

const { maybePromptForDefaultScadHandler } = await import('../fileAssociation');

describe('maybePromptForDefaultScadHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUiSettings = { hasCompletedNux: true, hasAnsweredDefaultScadHandlerPrompt: false };
    mockHandlerStatus = { supported: true, isDefault: false };
    mockInvoke.mockImplementation(async (command) =>
      command === 'get_scad_default_handler_status' ? mockHandlerStatus : undefined
    );
  });

  it('sets Studio as the default app when the user accepts', async () => {
    mockAsk.mockResolvedValue(true);

    await maybePromptForDefaultScadHandler();

    expect(mockAsk).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('set_as_default_scad_handler');
    expect(mockUpdateSetting).toHaveBeenCalledWith('ui', {
      hasAnsweredDefaultScadHandlerPrompt: true,
    });
  });

  it('remembers a declined prompt without changing the default app', async () => {
    mockAsk.mockResolvedValue(false);

    await maybePromptForDefaultScadHandler();

    expect(mockInvoke).not.toHaveBeenCalledWith('set_as_default_scad_handler');
    expect(mockUpdateSetting).toHaveBeenCalledWith('ui', {
      hasAnsweredDefaultScadHandlerPrompt: true,
    });
  });

  it.each([
    ['the prompt was already answered', { hasAnsweredDefaultScadHandlerPrompt: true }, {}],
    ['onboarding is not complete', { hasCompletedNux: false }, {}],
    ['Studio is already the default app', {}, { isDefault: true }],
    ['the platform does not support it', {}, { supported: false }],
  ])('does not prompt when %s', async (_label, ui, status) => {
    mockUiSettings = { ...mockUiSettings, ...ui };
    mockHandlerStatus = { ...mockHandlerStatus, ...status };

    await maybePromptForDefaultScadHandler();

    expect(mockAsk).not.toHaveBeenCalled();
    expect(mockUpdateSetting).not.toHaveBeenCalled();
  });
});
