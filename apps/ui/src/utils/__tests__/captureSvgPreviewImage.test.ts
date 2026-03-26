import {
  captureSvgPreviewImage,
  computeThumbnailFrame,
  expandSvgViewportForThumbnail,
} from '../captureSvgPreviewImage';

describe('captureSvgPreviewImage', () => {
  it('scales tiny SVG dimensions into a large centered social card frame', () => {
    const frame = computeThumbnailFrame(90, 54, 1200, 630, 72);

    expect(frame.width).toBeCloseTo(810);
    expect(frame.height).toBeCloseTo(486);
    expect(frame.x).toBeCloseTo(195);
    expect(frame.y).toBeCloseTo(72);
  });

  it('preserves aspect ratio for tall artwork', () => {
    const frame = computeThumbnailFrame(200, 600, 1200, 630, 72);

    expect(frame.width / frame.height).toBeCloseTo(200 / 600);
    expect(frame.height).toBeCloseTo(486);
    expect(frame.width).toBeCloseTo(162);
  });

  it('returns null when no svg source or svg markup is available', async () => {
    await expect(captureSvgPreviewImage()).resolves.toBeNull();
  });

  it('expands the source svg viewBox before rasterizing so strokes are less likely to clip', () => {
    const expanded = expandSvgViewportForThumbnail(
      '<svg viewBox="0 0 100 50" width="100" height="50"><rect width="100" height="50" /></svg>',
      0.05
    );

    expect(expanded).toContain('viewBox="-5 -5 110 60"');
    expect(expanded).toContain('width="110"');
    expect(expanded).toContain('height="60"');
  });
});
