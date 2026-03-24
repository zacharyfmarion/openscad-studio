/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { useShareLoader } from '../useShareLoader';

const mockGetShare = jest.fn();

jest.mock('../../services/shareService', () => ({
  getShare: (...args: unknown[]) => mockGetShare(...args),
}));

function TestComponent({ enabled = true }: { enabled?: boolean }) {
  const state = useShareLoader(enabled);

  return (
    <div>
      <div data-testid="loading">{String(state.isLoading)}</div>
      <div data-testid="error">{state.error ?? ''}</div>
      <div data-testid="title">{state.shareData?.title ?? ''}</div>
      <div data-testid="mode">{state.shareContext?.mode ?? ''}</div>
    </div>
  );
}

describe('useShareLoader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/');
    delete window.__SHARE_CONTEXT;
  });

  it('loads share data and cleans the URL after success', async () => {
    mockGetShare.mockResolvedValue({
      id: 'abc12345',
      code: 'cube(10);',
      title: 'Test Share',
      createdAt: '2026-03-24T00:00:00.000Z',
      forkedFrom: null,
      thumbnailUrl: null,
    });

    window.__SHARE_CONTEXT = { shareId: 'abc12345', mode: 'customizer' };
    window.history.replaceState({}, '', '/s/abc12345');

    render(<TestComponent />);

    expect(screen.getByTestId('mode').textContent).toBe('customizer');
    await waitFor(() => {
      expect(screen.getByTestId('title').textContent).toBe('Test Share');
    });
    expect(window.location.pathname).toBe('/');
  });

  it('shows a friendly not-found error', async () => {
    const error = new Error('Design not found') as Error & { status: number };
    error.status = 404;
    mockGetShare.mockRejectedValue(error);

    window.__SHARE_CONTEXT = { shareId: 'missing', mode: 'editor' };

    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('error').textContent).toBe(
        "This design doesn't exist or has been removed."
      );
    });
  });

  it('stays idle when disabled', () => {
    window.__SHARE_CONTEXT = { shareId: 'abc12345', mode: 'customizer' };

    render(<TestComponent enabled={false} />);

    expect(screen.getByTestId('loading').textContent).toBe('false');
    expect(mockGetShare).not.toHaveBeenCalled();
  });
});
