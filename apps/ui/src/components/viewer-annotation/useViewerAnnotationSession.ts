import { useCallback, useState } from 'react';
import {
  createDraftAnnotation,
  draftToAnnotationShape,
  updateDraftAnnotation,
} from './annotationGeometry';
import type { AnnotationShape, AnnotationTool, DraftAnnotation, NormalizedPoint } from './types';

export interface ViewerAnnotationSession {
  tool: AnnotationTool;
  shapes: AnnotationShape[];
  draft: DraftAnnotation | null;
  setTool: (tool: AnnotationTool) => void;
  beginDraft: (start: NormalizedPoint) => void;
  updateDraft: (point: NormalizedPoint) => void;
  completeDraft: () => AnnotationShape | null;
  cancelDraft: () => void;
  clearAll: () => void;
  undoLast: () => void;
  resetSession: () => void;
}

export function useViewerAnnotationSession(
  initialTool: AnnotationTool = 'box'
): ViewerAnnotationSession {
  const [tool, setTool] = useState<AnnotationTool>(initialTool);
  const [shapes, setShapes] = useState<AnnotationShape[]>([]);
  const [draft, setDraft] = useState<DraftAnnotation | null>(null);

  const beginDraft = useCallback(
    (start: NormalizedPoint) => {
      setDraft(createDraftAnnotation(tool, start));
    },
    [tool]
  );

  const updateDraft = useCallback((point: NormalizedPoint) => {
    setDraft((current) => (current ? updateDraftAnnotation(current, point) : current));
  }, []);

  const completeDraft = useCallback(() => {
    if (!draft) {
      return null;
    }

    const committedShape = draftToAnnotationShape(draft);
    if (committedShape) {
      setShapes((existing) => [...existing, committedShape]);
    }
    setDraft(null);

    return committedShape;
  }, [draft]);

  const cancelDraft = useCallback(() => {
    setDraft(null);
  }, []);

  const clearAll = useCallback(() => {
    setShapes([]);
    setDraft(null);
  }, []);

  const undoLast = useCallback(() => {
    if (draft) {
      setDraft(null);
      return;
    }

    setShapes((existing) => existing.slice(0, -1));
  }, [draft]);

  const resetSession = useCallback(() => {
    setShapes([]);
    setDraft(null);
    setTool(initialTool);
  }, [initialTool]);

  return {
    tool,
    shapes,
    draft,
    setTool,
    beginDraft,
    updateDraft,
    completeDraft,
    cancelDraft,
    clearAll,
    undoLast,
    resetSession,
  };
}
