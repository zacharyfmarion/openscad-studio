import { hasRenderableOutput } from '../renderOutput';

describe('renderOutput', () => {
  it('treats empty render output as non-displayable so fallback logic can continue', () => {
    expect(hasRenderableOutput(new Uint8Array())).toBe(false);
    expect(hasRenderableOutput(new Uint8Array([1]))).toBe(true);
  });
});
