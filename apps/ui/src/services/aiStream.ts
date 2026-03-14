import { streamText } from 'ai';

type StreamTextArgs = Parameters<typeof streamText>[0];
type StreamTextResult = ReturnType<typeof streamText>;

declare global {
  // Test hook used by Playwright to provide deterministic streamed chunks.
  var __OPENSCAD_STUDIO_AI_STREAM_MOCK__:
    | ((options: StreamTextArgs) => StreamTextResult | Promise<StreamTextResult>)
    | undefined;
}

export async function startAiStream(options: StreamTextArgs): Promise<StreamTextResult> {
  const mock = globalThis.__OPENSCAD_STUDIO_AI_STREAM_MOCK__;
  if (mock) {
    return await mock(options);
  }
  return streamText(options);
}
