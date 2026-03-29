/** @jest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import {
  createDraftAnnotation,
  draftToAnnotationShape,
  getExportScale,
  normalizeViewerPoint,
} from '../viewer-annotation/annotationGeometry';
import { useViewerAnnotationSession } from '../viewer-annotation/useViewerAnnotationSession';

describe('viewer annotation helpers', () => {
  it('normalizes viewer points into clamped 0..1 coordinates', () => {
    expect(normalizeViewerPoint({ x: 50, y: 25 }, { width: 200, height: 100 })).toEqual({
      x: 0.25,
      y: 0.25,
    });
    expect(normalizeViewerPoint({ x: -5, y: 999 }, { width: 200, height: 100 })).toEqual({
      x: 0,
      y: 1,
    });
  });

  it('builds committed box and freehand shapes from drafts', () => {
    const boxDraft = {
      ...createDraftAnnotation('box', { x: 0.1, y: 0.2 }),
      current: { x: 0.5, y: 0.6 },
    };
    expect(draftToAnnotationShape(boxDraft)).toMatchObject({
      kind: 'box',
      start: { x: 0.1, y: 0.2 },
      end: { x: 0.5, y: 0.6 },
    });

    const freehandDraft = {
      ...createDraftAnnotation('freehand', { x: 0.1, y: 0.2 }),
      current: { x: 0.3, y: 0.4 },
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.2, y: 0.3 },
        { x: 0.3, y: 0.4 },
      ],
    };
    expect(draftToAnnotationShape(freehandDraft)).toMatchObject({
      kind: 'freehand',
      points: freehandDraft.points,
    });
  });

  it('clamps export scale to the max edge without shrinking below the floor', () => {
    expect(getExportScale({ width: 800, height: 600 }, 1600, 2)).toBe(2);
    expect(getExportScale({ width: 3200, height: 1600 }, 1600, 2)).toBe(0.5);
    expect(getExportScale({ width: 12000, height: 1000 }, 1600, 3)).toBeGreaterThanOrEqual(0.25);
  });

  it('supports undo and clear behavior through the shared session hook', () => {
    const { result } = renderHook(() => useViewerAnnotationSession());

    act(() => {
      result.current.beginDraft({ x: 0.1, y: 0.1 });
    });
    act(() => {
      result.current.updateDraft({ x: 0.5, y: 0.4 });
    });
    act(() => {
      result.current.completeDraft();
    });

    expect(result.current.shapes).toHaveLength(1);

    act(() => {
      result.current.undoLast();
    });

    expect(result.current.shapes).toHaveLength(0);

    act(() => {
      result.current.beginDraft({ x: 0.2, y: 0.2 });
    });
    act(() => {
      result.current.updateDraft({ x: 0.6, y: 0.6 });
    });
    act(() => {
      result.current.completeDraft();
      result.current.clearAll();
    });

    expect(result.current.shapes).toHaveLength(0);
    expect(result.current.draft).toBeNull();
  });
});
