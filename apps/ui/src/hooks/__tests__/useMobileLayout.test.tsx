/** @jest-environment jsdom */

import { render, act, screen } from '@testing-library/react';
import { jest } from '@jest/globals';

const mockHideWelcomeScreen = jest.fn();
const mockUseWorkspaceStore = jest.fn();

jest.unstable_mockModule('@/stores/workspaceStore', () => ({
  useWorkspaceStore: mockUseWorkspaceStore,
}));

jest.unstable_mockModule('@/stores/workspaceSelectors', () => ({
  selectShowWelcome: (state: { showWelcome: boolean }) => state.showWelcome,
}));

let useMobileLayout: typeof import('../useMobileLayout').useMobileLayout;

type MqListener = (e: Partial<MediaQueryListEvent>) => void;

function setupMatchMedia(matches: boolean) {
  const listeners: MqListener[] = [];
  const mockMq = {
    matches,
    media: '(max-width: 767px)',
    addEventListener: jest.fn((_event: string, handler: MqListener) => {
      listeners.push(handler);
    }),
    removeEventListener: jest.fn((_event: string, handler: MqListener) => {
      const index = listeners.indexOf(handler);
      if (index !== -1) listeners.splice(index, 1);
    }),
    dispatchEvent: jest.fn(),
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockReturnValue(mockMq),
  });
  return {
    mockMq,
    triggerChange: (newMatches: boolean) => {
      listeners.forEach((l) => l({ matches: newMatches }));
    },
    listenerCount: () => listeners.length,
  };
}

function mockWorkspaceStore(showWelcome: boolean) {
  mockUseWorkspaceStore.mockImplementation((selector: (s: object) => unknown) =>
    selector({ showWelcome, hideWelcomeScreen: mockHideWelcomeScreen })
  );
}

function Harness() {
  const { isMobile } = useMobileLayout();
  return <div data-testid="is-mobile">{String(isMobile)}</div>;
}

describe('useMobileLayout', () => {
  beforeAll(async () => {
    ({ useMobileLayout } = await import('../useMobileLayout'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns isMobile=false when viewport is desktop', () => {
    setupMatchMedia(false);
    mockWorkspaceStore(false);

    render(<Harness />);
    expect(screen.getByTestId('is-mobile').textContent).toBe('false');
  });

  it('returns isMobile=true when viewport is mobile', () => {
    setupMatchMedia(true);
    mockWorkspaceStore(false);

    render(<Harness />);
    expect(screen.getByTestId('is-mobile').textContent).toBe('true');
  });

  it('toggles isMobile to true when media query fires a mobile match', () => {
    const { triggerChange } = setupMatchMedia(false);
    mockWorkspaceStore(false);

    render(<Harness />);
    expect(screen.getByTestId('is-mobile').textContent).toBe('false');

    act(() => {
      triggerChange(true);
    });
    expect(screen.getByTestId('is-mobile').textContent).toBe('true');
  });

  it('toggles isMobile to false when media query fires a desktop match', () => {
    const { triggerChange } = setupMatchMedia(true);
    mockWorkspaceStore(false);

    render(<Harness />);
    expect(screen.getByTestId('is-mobile').textContent).toBe('true');

    act(() => {
      triggerChange(false);
    });
    expect(screen.getByTestId('is-mobile').textContent).toBe('false');
  });

  it('calls hideWelcomeScreen when mobile and welcome is showing', () => {
    setupMatchMedia(true);
    mockWorkspaceStore(true);

    render(<Harness />);
    expect(mockHideWelcomeScreen).toHaveBeenCalledTimes(1);
  });

  it('does not call hideWelcomeScreen when mobile but welcome is already hidden', () => {
    setupMatchMedia(true);
    mockWorkspaceStore(false);

    render(<Harness />);
    expect(mockHideWelcomeScreen).not.toHaveBeenCalled();
  });

  it('does not call hideWelcomeScreen on desktop even if welcome is showing', () => {
    setupMatchMedia(false);
    mockWorkspaceStore(true);

    render(<Harness />);
    expect(mockHideWelcomeScreen).not.toHaveBeenCalled();
  });

  it('removes the media query listener on unmount', () => {
    const { mockMq, listenerCount } = setupMatchMedia(false);
    mockWorkspaceStore(false);

    const { unmount } = render(<Harness />);
    expect(listenerCount()).toBe(1);

    unmount();
    expect(mockMq.removeEventListener).toHaveBeenCalledTimes(1);
  });
});
