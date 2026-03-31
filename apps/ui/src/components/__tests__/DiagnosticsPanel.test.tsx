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
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    panelResizeHeight = 240;
    panelClientHeight = 240;
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 900,
    });

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
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: originalInnerHeight,
    });

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

  it('orders sections as errors, warnings, then output', () => {
    const diagnostics: Diagnostic[] = [
      { severity: 'error', line: 7, message: 'Unexpected token' },
      { severity: 'warning', line: 9, message: 'Potential issue' },
      { severity: 'info', message: 'ECHO: ready' },
    ];

    renderWithProviders(<DiagnosticsPanel diagnostics={diagnostics} />);

    const sectionButtons = screen
      .getAllByRole('button')
      .map((button) => button.textContent?.replace(/\s+/g, ' ').trim());

    expect(sectionButtons).toEqual(['Errors1', 'Warnings1', 'Output1']);
    expect(screen.getByText('Unexpected token')).toBeInTheDocument();
    expect(screen.getByText('Potential issue')).toBeInTheDocument();
    expect(screen.getByText('ready')).toBeInTheDocument();
    expect(screen.getByText('Line 7:')).toBeInTheDocument();
  });

  it('collapses a section without affecting the others', () => {
    const diagnostics: Diagnostic[] = [
      { severity: 'error', line: 7, message: 'Unexpected token' },
      { severity: 'warning', line: 9, message: 'Potential issue' },
      { severity: 'info', message: 'ECHO: ready' },
    ];

    renderWithProviders(<DiagnosticsPanel diagnostics={diagnostics} />);

    fireEvent.click(screen.getByTestId('diagnostic-panel-section-warning'));

    expect(screen.queryByText('Potential issue')).not.toBeInTheDocument();
    expect(screen.getByText('Unexpected token')).toBeInTheDocument();
    expect(screen.getByText('ready')).toBeInTheDocument();
    expect(screen.getByTestId('diagnostic-panel-section-warning')).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('virtualizes long diagnostic lists and updates the window on scroll', async () => {
    const diagnostics: Diagnostic[] = Array.from({ length: 200 }, (_, index) => ({
      severity: index % 2 === 0 ? 'warning' : 'error',
      line: index + 1,
      message: `message ${index}`,
    }));

    renderWithProviders(<DiagnosticsPanel diagnostics={diagnostics} />);

    const panel = screen.getByTestId('diagnostics-panel');

    expect(screen.getByText('message 1')).toBeInTheDocument();
    expect(screen.queryByText('message 199')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('diagnostic-panel-row-item').length).toBeLessThan(200);

    Object.defineProperty(panel, 'scrollTop', {
      configurable: true,
      value: 8600,
      writable: true,
    });
    fireEvent.scroll(panel);

    await waitFor(() => {
      expect(screen.getByText('message 198')).toBeInTheDocument();
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

  it('falls back to the window height when panel measurements are unavailable on first render', async () => {
    panelResizeHeight = 0;
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

  it('anchors scroll position when expanding a collapsed section above the viewport', async () => {
    const diagnostics: Diagnostic[] = [
      ...Array.from({ length: 8 }, (_, index) => ({
        severity: 'error' as const,
        line: index + 1,
        message: `error ${index}`,
      })),
      ...Array.from({ length: 40 }, (_, index) => ({
        severity: 'info' as const,
        message: `ECHO: output ${index}`,
      })),
    ];

    renderWithProviders(<DiagnosticsPanel diagnostics={diagnostics} />);

    const panel = screen.getByTestId('diagnostics-panel');
    fireEvent.click(screen.getByTestId('diagnostic-panel-section-error'));

    Object.defineProperty(panel, 'scrollTop', {
      configurable: true,
      value: 500,
      writable: true,
    });
    fireEvent.scroll(panel);

    const beforeExpand = panel.scrollTop;
    fireEvent.click(screen.getByTestId('diagnostic-panel-section-error'));

    await waitFor(() => {
      expect(panel.scrollTop).toBeGreaterThan(beforeExpand);
    });
  });
});
