import { Page, Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// AI API mocking for E2E tests
// ---------------------------------------------------------------------------

interface StreamEvent {
  type: 'text' | 'tool-call' | 'tool-result' | 'error' | 'done';
  content?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
}

/**
 * Mock AI responses by intercepting Anthropic and OpenAI API calls.
 * Returns SSE streams matching the expected format.
 */
export async function mockAiResponses(page: Page, responses: StreamEvent[]): Promise<void> {
  // Intercept Anthropic API
  await page.route('**/api.anthropic.com/**', async (route) => {
    await fulfillWithSSE(route, responses);
  });

  // Intercept OpenAI API
  await page.route('**/api.openai.com/**', async (route) => {
    await fulfillWithSSE(route, responses);
  });

  // Also intercept any proxied / local AI API routes
  await page.route('**/v1/messages', async (route) => {
    await fulfillWithSSE(route, responses);
  });
  await page.route('**/v1/chat/completions', async (route) => {
    await fulfillWithSSE(route, responses);
  });
}

/**
 * Mock a simple text-only AI response.
 */
export async function mockSimpleAiResponse(page: Page, text: string): Promise<void> {
  await mockAiResponses(page, [{ type: 'text', content: text }, { type: 'done' }]);
}

/**
 * Mock an AI response that includes a tool call.
 */
export async function mockAiWithToolCall(
  page: Page,
  opts: {
    thinkingText?: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    toolResult: string;
    finalText: string;
  }
): Promise<void> {
  await mockAiResponses(page, [
    ...(opts.thinkingText ? [{ type: 'text' as const, content: opts.thinkingText }] : []),
    {
      type: 'tool-call' as const,
      toolName: opts.toolName,
      toolInput: opts.toolInput,
    },
    { type: 'tool-result' as const, toolResult: opts.toolResult },
    { type: 'text' as const, content: opts.finalText },
    { type: 'done' as const },
  ]);
}

/**
 * Mock an AI API error response.
 */
export async function mockAiError(page: Page, errorMessage: string): Promise<void> {
  await page.route('**/api.anthropic.com/**', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: errorMessage } }),
    });
  });
  await page.route('**/api.openai.com/**', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: errorMessage } }),
    });
  });
}

/**
 * Clear all AI route mocks.
 */
export async function clearAiMocks(page: Page): Promise<void> {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
}

// ---------------------------------------------------------------------------

async function fulfillWithSSE(route: Route, events: StreamEvent[]) {
  const sseLines = events.map((event) => {
    return `data: ${JSON.stringify(event)}\n\n`;
  });
  sseLines.push('data: [DONE]\n\n');

  await route.fulfill({
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
    body: sseLines.join(''),
  });
}
