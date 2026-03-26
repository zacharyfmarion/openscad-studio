import { buildShareUrl, parseShareContext } from '../shareRouting';

describe('shareRouting', () => {
  it('parses customizer-first share URLs by default', () => {
    expect(parseShareContext('/s/abc12345', '')).toEqual({
      shareId: 'abc12345',
      mode: 'customizer-first',
    });
  });

  it('parses preset-based share URLs with the mode query', () => {
    expect(parseShareContext('/s/abc12345/', '?mode=default')).toEqual({
      shareId: 'abc12345',
      mode: 'default',
    });
    expect(parseShareContext('/s/abc12345/', '?mode=ai-first')).toEqual({
      shareId: 'abc12345',
      mode: 'ai-first',
    });
  });

  it('keeps old editor/customizer share links working', () => {
    expect(parseShareContext('/s/abc12345/', '?mode=editor')).toEqual({
      shareId: 'abc12345',
      mode: 'default',
    });
    expect(parseShareContext('/s/abc12345/', '?mode=customizer')).toEqual({
      shareId: 'abc12345',
      mode: 'customizer-first',
    });
  });

  it('returns null for unrelated paths', () => {
    expect(parseShareContext('/settings', '')).toBeNull();
  });

  it('builds preset-based share URLs predictably', () => {
    expect(buildShareUrl('https://openscad-studio.pages.dev', 'abc12345', 'customizer-first')).toBe(
      'https://openscad-studio.pages.dev/s/abc12345'
    );
    expect(buildShareUrl('https://openscad-studio.pages.dev', 'abc12345', 'default')).toBe(
      'https://openscad-studio.pages.dev/s/abc12345?mode=default'
    );
    expect(buildShareUrl('https://openscad-studio.pages.dev', 'abc12345', 'ai-first')).toBe(
      'https://openscad-studio.pages.dev/s/abc12345?mode=ai-first'
    );
  });
});
