/** @jest-environment jsdom */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { DiagnosticsPanel } from '../DiagnosticsPanel';
import { renderWithProviders } from './test-utils';
import type { Diagnostic } from '../../platform/historyService';

let panelResizeHeight = 240;
let panelClientHeight = 240;

class ResizeObserverMock {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: {
            width: 320,
            height:
              target instanceof HTMLElement &&
              target.getAttribute('data-testid') === 'diagnostics-panel'
                ? panelResizeHeight
                : 0,
          } as DOMRectReadOnly,
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver
    );
  }

  disconnect() {}

  unobserve() {}
}

describe('DiagnosticsPanel', () => {
  const originalClientHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'clientHeight'
  );

  beforeEach(() => {
    panelResizeHeight = 240;
    panelClientHeight = 240;

    Object.defineProperty(global, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: ResizeObserverMock,
    });

    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return this.getAttribute('data-testid') === 'diagnostics-panel' ? panelClientHeight : 0;
      },
    });
  });

  afterEach(() => {
    if (originalClientHeight) {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
    } else {
      // @ts-expect-error cleanup for environments without an own descriptor
      delete HTMLElement.prototype.clientHeight;
    }
  });

  it('renders the empty state when there are no diagnostics', () => {
    renderWithProviders(<DiagnosticsPanel diagnostics={[]} />);

    expect(screen.getByTestId('diagnostics-panel')).toHaveTextContent('No messages');
  });

  it('splits echo output and diagnostics into separate sections', () => {
    const diagnostics: Diagnostic[] = [
      { severity: 'info', message: 'ECHO: ready' },
      { severity: 'error', line: 7, message: 'Unexpected token' },
    ];

    renderWithProviders(<DiagnosticsPanel diagnostics={diagnostics} />);

    expect(screen.getByText('Output')).toBeInTheDocument();
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
    expect(screen.getByText('ready')).toBeInTheDocument();
    expect(screen.getByText('Line 7:')).toBeInTheDocument();
    expect(screen.getByText('Unexpected token')).toBeInTheDocument();
  });

  it('virtualizes long diagnostic lists and updates the window on scroll', async () => {
    const diagnostics: Diagnostic[] = Array.from({ length: 200 }, (_, index) => ({
      severity: index % 2 === 0 ? 'warning' : 'error',
      line: index + 1,
      message: `message ${index}`,
    }));

    renderWithProviders(<DiagnosticsPanel diagnostics={diagnostics} />);

    const panel = screen.getByTestId('diagnostics-panel');

    expect(screen.getByText('message 0')).toBeInTheDocument();
    expect(screen.queryByText('message 199')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('diagnostic-panel-row-item').length).toBeLessThan(200);

    Object.defineProperty(panel, 'scrollTop', {
      configurable: true,
      value: 8600,
      writable: true,
    });
    fireEvent.scroll(panel);

    await waitFor(() => {
      expect(screen.getByText('message 199')).toBeInTheDocument();
    });
  });

  it('uses the observed panel height when clientHeight is not ready yet', async () => {
    panelResizeHeight = 720;
    panelClientHeight = 0;

    const diagnostics: Diagnostic[] = Array.from({ length: 200 }, (_, index) => ({
      severity: 'info',
      line: index + 1,
      message: `message ${index}`,
    }));

    renderWithProviders(<DiagnosticsPanel diagnostics={diagnostics} />);

    await waitFor(() => {
      expect(screen.getByText('message 20')).toBeInTheDocument();
    });
  });
});
