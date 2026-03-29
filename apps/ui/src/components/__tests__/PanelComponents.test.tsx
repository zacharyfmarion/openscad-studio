/** @jest-environment jsdom */

import React, { type ReactNode } from 'react';
import { act, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { renderWithProviders } from './test-utils';

const customizerMountSpy = jest.fn();
const customizerPropsSpy = jest.fn();
const analyticsTrackSpy = jest.fn();

const workspaceState = {
  source: 'size = 12; // [1:24]',
  updateSource: jest.fn(),
  previewKind: 'mesh' as const,
  previewSrc: '',
  isRendering: false,
  error: '',
  diagnostics: [] as Array<{ severity: 'error' | 'warning' | 'info' }>,
  settings: {
    ui: {
      defaultLayoutPreset: 'default' as const,
    },
  },
  renderReady: true,
  onOpenCustomizerAiRefine: jest.fn(),
  onOpenEditorPanel: jest.fn(),
};

let workspaceStoreState = {
  activeTabId: 'tab-1',
  tabs: [
    {
      id: 'tab-1',
      content: 'size = 12; // [1:24]',
      customizerBaseContent: 'size = 12; // [1:24]',
    },
  ],
};

const eventListeners = new Map<string, Set<(payload: unknown) => void>>();

function emitPlatformEvent(eventName: string, payload: unknown) {
  for (const listener of eventListeners.get(eventName) ?? []) {
    listener(payload);
  }
}

jest.unstable_mockModule('@/components/Editor', () => ({
  Editor: () => null,
}));

jest.unstable_mockModule('@/components/Preview', () => ({
  Preview: () => null,
}));

jest.unstable_mockModule('@/components/AiPromptPanel', () => ({
  AiPromptPanel: () => null,
}));

jest.unstable_mockModule('@/components/DiagnosticsPanel', () => ({
  DiagnosticsPanel: () => null,
}));

jest.unstable_mockModule('@/components/DiffViewer', () => ({
  DiffViewer: () => null,
}));

jest.unstable_mockModule('@/components/ErrorBoundary', () => ({
  PanelErrorBoundary: ({ children }: { children: ReactNode }) => children,
}));

jest.unstable_mockModule('@/components/CustomizerPanel', () => ({
  CustomizerPanel: (props: { code: string; baselineCode: string }) => {
    customizerPropsSpy(props);

    // Track whether the wrapper forces a fresh mount after checkpoint restore.
    React.useEffect(() => {
      customizerMountSpy();
    }, []);

    return (
      <div data-testid="customizer-props">
        {props.code}
        {'\n---\n'}
        {props.baselineCode}
      </div>
    );
  },
}));

jest.unstable_mockModule('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => workspaceState,
}));

jest.unstable_mockModule('@/stores/workspaceStore', () => ({
  useWorkspaceStore: <T,>(selector: (state: typeof workspaceStoreState) => T) =>
    selector(workspaceStoreState),
}));

jest.unstable_mockModule('@/platform', () => ({
  eventBus: {
    on: (eventName: string, listener: (payload: unknown) => void) => {
      const listeners = eventListeners.get(eventName) ?? new Set<(payload: unknown) => void>();
      listeners.add(listener);
      eventListeners.set(eventName, listeners);

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          eventListeners.delete(eventName);
        }
      };
    },
  },
  getPlatform: () => ({
    fileExport: async () => {},
  }),
}));

jest.unstable_mockModule('@/analytics/runtime', () => ({
  useAnalytics: () => ({
    track: (...args: unknown[]) => analyticsTrackSpy(...args),
  }),
}));

jest.unstable_mockModule('@/services/exportErrors', () => ({
  isExportValidationError: () => false,
}));

jest.unstable_mockModule('@/services/renderService', () => ({
  RenderService: {
    getInstance: () => ({
      exportModel: jest.fn(),
    }),
  },
}));

jest.unstable_mockModule('@/utils/notifications', () => ({
  notifyError: jest.fn(),
}));

let panelComponents: typeof import('../panels/PanelComponents').panelComponents;

describe('panelComponents.customizer', () => {
  beforeAll(async () => {
    ({ panelComponents } = await import('../panels/PanelComponents'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    eventListeners.clear();
    workspaceState.source = 'size = 12; // [1:24]';
    workspaceStoreState = {
      activeTabId: 'tab-1',
      tabs: [
        {
          id: 'tab-1',
          content: 'size = 12; // [1:24]',
          customizerBaseContent: 'size = 12; // [1:24]',
        },
      ],
    };
  });

  it('remounts the customizer panel when a checkpoint restore is emitted', () => {
    const CustomizerWrapper = panelComponents.customizer;

    renderWithProviders(<CustomizerWrapper {...({} as never)} />);

    expect(customizerMountSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('customizer-props').textContent).toContain('size = 12; // [1:24]');

    workspaceState.source = 'size = 12;';
    workspaceStoreState = {
      activeTabId: 'tab-1',
      tabs: [
        {
          id: 'tab-1',
          content: 'size = 12;',
          customizerBaseContent: 'size = 12;',
        },
      ],
    };

    act(() => {
      emitPlatformEvent('history:restore', { code: 'size = 12;' });
    });

    expect(customizerMountSpy).toHaveBeenCalledTimes(2);
    expect(customizerPropsSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        code: 'size = 12;',
        baselineCode: 'size = 12;',
      })
    );
    expect(screen.getByTestId('customizer-props').textContent).toContain('size = 12;');
  });
});
