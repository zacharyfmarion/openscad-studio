import { buildShareUrl, parseShareContext } from '../shareRouting';

describe('shareRouting', () => {
  it('parses customizer share URLs by default', () => {
    expect(parseShareContext('/s/abc12345', '')).toEqual({
      shareId: 'abc12345',
      mode: 'customizer',
    });
  });

  it('parses editor share URLs with the mode query', () => {
    expect(parseShareContext('/s/abc12345/', '?mode=editor')).toEqual({
      shareId: 'abc12345',
      mode: 'editor',
    });
  });

  it('returns null for unrelated paths', () => {
    expect(parseShareContext('/settings', '')).toBeNull();
  });

  it('builds customizer and editor URLs predictably', () => {
    expect(buildShareUrl('https://openscad-studio.pages.dev', 'abc12345', 'customizer')).toBe(
      'https://openscad-studio.pages.dev/s/abc12345'
    );
    expect(buildShareUrl('https://openscad-studio.pages.dev', 'abc12345', 'editor')).toBe(
      'https://openscad-studio.pages.dev/s/abc12345?mode=editor'
    );
  });
});
