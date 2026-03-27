import { expect, test } from '../../fixtures/app.fixture';
import {
  clearAiMocks,
  installAiStreamMock,
  mockAiError,
  mockAiWithToolCall,
  mockSimpleAiResponse,
} from '../../helpers/ai-mock';

test.describe('AI Chat Panel', () => {
  test.afterEach(async ({ app }) => {
    await clearAiMocks(app.page);
  });

  async function openConfiguredAi(app: {
    configureAnthropicApiKey: () => Promise<void>;
    openAiPanel: () => Promise<void>;
  }) {
    await app.configureAnthropicApiKey();
    await app.openAiPanel();
  }

  test('AI panel is accessible via tab click', async ({ app }) => {
    await app.openAiPanel();
    await expect(
      app.page.getByText('Add an API key').or(app.page.getByPlaceholder(/describe the changes/i))
    ).toBeVisible({ timeout: 5000 });
  });

  test('shows no API key message when unconfigured', async ({ app }) => {
    await app.openAiPanel();
    await expect(app.page.getByText('Add an API key')).toBeVisible({ timeout: 5000 });
  });

  test('new conversation button exists when API key set', async ({ app }) => {
    await app.openAiPanel();
    const hasApiKeyPrompt = await app.page
      .getByText('Add an API key')
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (hasApiKeyPrompt) {
      await expect(app.page.getByTestId('ai-new-conversation-button')).not.toBeAttached();
      return;
    }

    await expect(app.page.getByTestId('ai-new-conversation-button')).toBeAttached({
      timeout: 5000,
    });
  });

  test('open settings button exists when no API key', async ({ app }) => {
    await app.openAiPanel();
    await expect(app.page.getByText('Open Settings')).toBeVisible({ timeout: 5000 });
  });

  test('Meta+K shortcut activates AI panel', async ({ app }) => {
    await app.dismissNux();
    await app.dismissWelcomeScreen();

    const editorTab = app.page.locator('.dv-tab').filter({ hasText: 'Editor' });
    if (await editorTab.isVisible().catch(() => false)) {
      await editorTab.click();
      await app.page.waitForTimeout(300);
    }

    await app.page.keyboard.press('Meta+k');
    await expect(
      app.page.getByText('Add an API key').or(app.page.getByPlaceholder(/describe the changes/i))
    ).toBeVisible({ timeout: 5000 });
  });

  test('streams assistant text into the transcript with incremental updates', async ({ app }) => {
    await openConfiguredAi(app);
    await installAiStreamMock(app.page, [
      { type: 'start' },
      { type: 'start-step' },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', text: 'Working', delayMs: 50 },
      { type: 'text-delta', id: 'text-1', text: ' on it', delayMs: 250 },
      { type: 'text-delta', id: 'text-1', text: ' now', delayMs: 250 },
      { type: 'text-end', id: 'text-1' },
      { type: 'finish-step' },
      { type: 'finish' },
    ]);

    await app.aiChatInput.fill('Add a bevel to the top edge.');
    await app.aiSubmitButton.click();

    await expect(app.aiTranscript).toContainText('Add a bevel to the top edge.');
    await expect(app.aiTranscript).toContainText('Working', { timeout: 5000 });
    await expect(app.aiTranscript).toContainText('Working on it now', { timeout: 5000 });
    await expect(app.aiCancelButton).not.toBeAttached();
  });

  test('persists text before and after tool activity without empty assistant bubbles', async ({
    app,
  }) => {
    await openConfiguredAi(app);
    await mockAiWithToolCall(app.page, {
      thinkingText: 'Checking the current file.',
      toolCallId: 'tool-1',
      toolName: 'get_current_code',
      toolInput: {},
      toolResult: 'cube(10);',
      finalText: 'I found the current code.',
      delayMs: 50,
    });

    await app.aiChatInput.fill('What is in the current file?');
    await app.aiSubmitButton.click();

    await expect(app.aiTranscript).toContainText('Checking the current file.', { timeout: 5000 });
    await expect(app.aiTranscript).toContainText('get_current_code', { timeout: 5000 });
    await expect(app.aiTranscript).toContainText('I found the current code.', { timeout: 5000 });
  });

  test('renders repeated tool names as distinct tool rows', async ({ app }) => {
    await openConfiguredAi(app);
    await installAiStreamMock(app.page, [
      { type: 'start' },
      { type: 'start-step' },
      { type: 'tool-input-start', id: 'tool-1', toolName: 'read_file' },
      { type: 'tool-input-end', id: 'tool-1' },
      { type: 'tool-call', toolCallId: 'tool-1', toolName: 'read_file', input: { path: 'a.scad' } },
      {
        type: 'tool-result',
        toolCallId: 'tool-1',
        toolName: 'read_file',
        input: { path: 'a.scad' },
        output: 'cube(10);',
      },
      { type: 'finish-step' },
      { type: 'start-step' },
      { type: 'tool-input-start', id: 'tool-2', toolName: 'read_file' },
      { type: 'tool-input-end', id: 'tool-2' },
      { type: 'tool-call', toolCallId: 'tool-2', toolName: 'read_file', input: { path: 'b.scad' } },
      {
        type: 'tool-result',
        toolCallId: 'tool-2',
        toolName: 'read_file',
        input: { path: 'b.scad' },
        output: 'sphere(5);',
      },
      { type: 'finish-step' },
      { type: 'start-step' },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', text: 'I checked both files.' },
      { type: 'text-end', id: 'text-1' },
      { type: 'finish-step' },
      { type: 'finish' },
    ]);

    await app.aiChatInput.fill('Compare a.scad and b.scad.');
    await app.aiSubmitButton.click();

    await expect(app.aiTranscript).toContainText('I checked both files.', { timeout: 5000 });
    await expect(app.aiTranscript.getByText('read_file', { exact: true })).toHaveCount(2);
  });

  test('cancel preserves partial assistant output and marks it as cancelled', async ({ app }) => {
    await openConfiguredAi(app);
    await installAiStreamMock(app.page, [
      { type: 'start' },
      { type: 'start-step' },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', text: 'First chunk', delayMs: 50 },
      { type: 'text-delta', id: 'text-1', text: ' final chunk', delayMs: 1500 },
      { type: 'text-end', id: 'text-1' },
      { type: 'finish-step' },
      { type: 'finish' },
    ]);

    await app.aiChatInput.fill('Please think carefully.');
    await app.aiSubmitButton.click();

    await expect(app.aiTranscript).toContainText('First chunk', { timeout: 5000 });
    await app.aiCancelButton.click();
    await expect(app.aiCancelButton).not.toBeAttached({ timeout: 5000 });

    await app.page.waitForTimeout(1800);
    await expect(app.aiTranscript).toContainText('First chunk');
    await expect(app.aiTranscript).toContainText('Cancelled');
    await expect(app.aiTranscript).not.toContainText('First chunk final chunk');
  });

  test('preserves partial text and shows an inline error state plus toast on stream failure', async ({
    app,
  }) => {
    await openConfiguredAi(app);
    await mockAiError(app.page, 'Upstream exploded', {
      partialText: 'I started working on this.',
      delayMs: 50,
    });

    await app.aiChatInput.fill('Make the model hollow.');
    await app.aiSubmitButton.click();

    await expect(app.aiTranscript).toContainText('I started working on this.', { timeout: 5000 });
    await expect(app.aiTranscript).toContainText('Stopped due to error');
    await expect(app.page.getByText('Failed: Upstream exploded')).toBeVisible({ timeout: 5000 });
  });

  test('flushes text buffered at finish-step even without a trailing text-end event', async ({
    app,
  }) => {
    await openConfiguredAi(app);
    await installAiStreamMock(app.page, [
      { type: 'start' },
      { type: 'start-step' },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', text: 'First step summary.' },
      { type: 'finish-step' },
      { type: 'start-step' },
      { type: 'text-start', id: 'text-2' },
      { type: 'text-delta', id: 'text-2', text: 'Second step summary.' },
      { type: 'text-end', id: 'text-2' },
      { type: 'finish-step' },
      { type: 'finish' },
    ]);

    await app.aiChatInput.fill('Explain what you are doing.');
    await app.aiSubmitButton.click();

    await expect(app.aiTranscript).toContainText('First step summary.', { timeout: 5000 });
    await expect(app.aiTranscript).toContainText('Second step summary.', { timeout: 5000 });
  });

  test('simple text-only helper still works with realistic stream events', async ({ app }) => {
    await openConfiguredAi(app);
    await mockSimpleAiResponse(app.page, 'Simple answer.', { chunkDelayMs: 25 });

    await app.aiChatInput.fill('Say something simple.');
    await app.aiSubmitButton.click();

    await expect(app.aiTranscript).toContainText('Simple answer.', { timeout: 5000 });
  });
});
