/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { resetShareEntryStore } from '../../stores/shareEntryStore';
import { Button } from '../../components/ui';

const mockGetShare = jest.fn();
const mockOpenSharedDocument = jest.fn();
const mockRenderSharedDocument = jest.fn();
const mockOpenFallbackEditor = jest.fn();

jest.unstable_mockModule('@/services/shareService', () => ({
  getShare: (...args: unknown[]) => mockGetShare(...args),
}));

let useShareEntry: typeof import('../useShareEntry').useShareEntry;

function TestComponent() {
  const state = useShareEntry({
    renderReady: true,
    openSharedDocument: mockOpenSharedDocument,
    renderSharedDocument: mockRenderSharedDocument,
    openFallbackEditor: mockOpenFallbackEditor,
  });

  return (
    <div>
      <div data-testid="phase">{state.phase}</div>
      <div data-testid="error">{state.error ?? ''}</div>
      <div data-testid="active">{String(state.isActive)}</div>
      <div data-testid="origin">{state.origin?.title ?? ''}</div>
      <div data-testid="block">{String(state.shouldBlockUi)}</div>
      <Button onClick={state.markVisualReady}>ready</Button>
      <Button onClick={state.skip}>skip</Button>
    </div>
  );
}

describe('useShareEntry', () => {
  beforeAll(async () => {
    ({ useShareEntry } = await import('../useShareEntry'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenSharedDocument.mockReturnValue('tab-1');
    mockRenderSharedDocument.mockResolvedValue({
      previewSrc: 'blob:mesh',
      previewKind: 'mesh',
      diagnostics: [],
      error: '',
      dimensionMode: '3d',
    });
    window.__SHARE_CONTEXT = { shareId: 'abc12345', mode: 'customizer-first' };
    window.history.replaceState({}, '', '/s/abc12345');
    resetShareEntryStore(window.__SHARE_CONTEXT);
  });

  it('fetches and opens the shared design exactly once before waiting for visual readiness', async () => {
    mockGetShare.mockResolvedValue({
      id: 'abc12345',
      code: 'cube(10);',
      title: 'Test Share',
      createdAt: '2026-03-24T00:00:00.000Z',
      forkedFrom: null,
      thumbnailUrl: null,
    });

    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('rendering');
    });

    expect(mockOpenSharedDocument).toHaveBeenCalledTimes(1);
    expect(mockRenderSharedDocument).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('origin').textContent).toBe('Test Share');
    expect(screen.getByTestId('block').textContent).toBe('true');

    fireEvent.click(screen.getByText('ready'));

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('ready');
    });
  });

  it('supports skipping to the editor after an error', async () => {
    const error = new Error('not found') as Error & { status: number };
    error.status = 404;
    mockGetShare.mockRejectedValue(error);

    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('error');
    });

    fireEvent.click(screen.getByText('skip'));

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('skipped');
    });

    expect(mockOpenFallbackEditor).toHaveBeenCalledTimes(1);
  });
});
