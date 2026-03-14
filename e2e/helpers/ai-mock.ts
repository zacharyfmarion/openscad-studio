import { Page } from '@playwright/test';

export interface StreamEvent {
  type: string;
  delayMs?: number;
  [key: string]: unknown;
}

declare global {
  interface Window {
    __OPENSCAD_STUDIO_AI_STREAM_MOCK__?: () => {
      fullStream: AsyncIterable<Record<string, unknown>>;
    };
  }
}

function stripDelayMs(event: StreamEvent) {
  const { delayMs: _delayMs, ...streamEvent } = event;
  return streamEvent;
}

export async function installAiStreamMock(page: Page, events: StreamEvent[]): Promise<void> {
  await page.evaluate((mockEvents) => {
    const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

    window.__OPENSCAD_STUDIO_AI_STREAM_MOCK__ = () => ({
      fullStream: (async function* () {
        for (const event of mockEvents) {
          if (typeof event.delayMs === 'number' && event.delayMs > 0) {
            await sleep(event.delayMs);
          }

          yield stripDelayMs(event);
        }
      })(),
    });

    function stripDelayMs(event: StreamEvent) {
      const { delayMs: _delayMs, ...streamEvent } = event;
      return streamEvent;
    }
  }, events);
}

export async function mockSimpleAiResponse(
  page: Page,
  text: string,
  opts?: { chunkDelayMs?: number }
): Promise<void> {
  await installAiStreamMock(page, [
    { type: 'start' },
    { type: 'start-step' },
    { type: 'text-start', id: 'text-1' },
    {
      type: 'text-delta',
      id: 'text-1',
      text,
      delayMs: opts?.chunkDelayMs ?? 0,
    },
    { type: 'text-end', id: 'text-1' },
    { type: 'finish-step' },
    { type: 'finish' },
  ]);
}

export async function mockAiWithToolCall(
  page: Page,
  opts: {
    thinkingText?: string;
    toolCallId?: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    toolResult: unknown;
    finalText: string;
    delayMs?: number;
  }
): Promise<void> {
  const delayMs = opts.delayMs ?? 0;
  const toolCallId = opts.toolCallId ?? 'tool-call-1';
  const events: StreamEvent[] = [{ type: 'start' }];

  if (opts.thinkingText) {
    events.push(
      { type: 'start-step' },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', text: opts.thinkingText, delayMs },
      { type: 'finish-step' }
    );
  }

  events.push(
    { type: 'start-step' },
    { type: 'tool-input-start', id: toolCallId, toolName: opts.toolName },
    { type: 'tool-input-end', id: toolCallId },
    {
      type: 'tool-call',
      toolCallId,
      toolName: opts.toolName,
      input: opts.toolInput,
      delayMs,
    },
    {
      type: 'tool-result',
      toolCallId,
      toolName: opts.toolName,
      input: opts.toolInput,
      output: opts.toolResult,
      delayMs,
    },
    { type: 'finish-step' },
    { type: 'start-step' },
    { type: 'text-start', id: 'text-2' },
    { type: 'text-delta', id: 'text-2', text: opts.finalText, delayMs },
    { type: 'text-end', id: 'text-2' },
    { type: 'finish-step' },
    { type: 'finish' }
  );

  await installAiStreamMock(page, events);
}

export async function mockAiError(
  page: Page,
  errorMessage: string,
  opts?: { partialText?: string; delayMs?: number }
): Promise<void> {
  const delayMs = opts?.delayMs ?? 0;
  const events: StreamEvent[] = [{ type: 'start' }, { type: 'start-step' }];

  if (opts?.partialText) {
    events.push(
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', text: opts.partialText, delayMs }
    );
  }

  events.push({
    type: 'error',
    error: errorMessage,
    delayMs,
  });

  await installAiStreamMock(page, events);
}

export async function clearAiMocks(page: Page): Promise<void> {
  await page.evaluate(() => {
    delete window.__OPENSCAD_STUDIO_AI_STREAM_MOCK__;
  });
}
