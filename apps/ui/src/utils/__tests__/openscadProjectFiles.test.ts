import {
  isOpenScadProjectFilePath,
  isRenderableOpenScadFilePath,
  pickOpenScadRenderTarget,
} from '../../../../../packages/shared/src/openscadProjectFiles';

describe('openscadProjectFiles helpers', () => {
  it('recognizes supported project file paths', () => {
    expect(isOpenScadProjectFilePath('main.scad')).toBe(true);
    expect(isOpenScadProjectFilePath('lib/constants.h')).toBe(true);
    expect(isOpenScadProjectFilePath('readme.txt')).toBe(false);
  });

  it('only treats .scad files as renderable targets', () => {
    expect(isRenderableOpenScadFilePath('main.scad')).toBe(true);
    expect(isRenderableOpenScadFilePath('lib/constants.h')).toBe(false);
  });

  it('picks main.scad ahead of headers and alphabetic fallbacks', () => {
    expect(pickOpenScadRenderTarget(['lib/constants.h', 'z.scad', 'main.scad', 'a.scad'])).toBe(
      'main.scad'
    );
  });

  it('returns null when no renderable files exist', () => {
    expect(pickOpenScadRenderTarget(['lib/constants.h', 'params.h'])).toBeNull();
  });
});
