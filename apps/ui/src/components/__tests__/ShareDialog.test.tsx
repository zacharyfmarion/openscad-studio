/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { TextEncoder } from 'util';
import { ThemeProvider } from '../../contexts/ThemeContext';

const mockCreateShare = jest.fn();
const mockUploadThumbnail = jest.fn();
const mockCaptureOffscreen = jest.fn(async () => 'data:image/png;base64,AAA=');

// Return a stable object so that components with `analytics` in useEffect deps don't
// re-run the effect on every render (the real useAnalytics is memoized).
jest.unstable_mockModule('@/analytics/runtime', () => {
  const stableAnalytics = {
    track: jest.fn(),
    trackError: jest.fn(),
    setAnalyticsEnabled: jest.fn(),
  };
  return {
    bucketCount: (value: number) => String(value),
    createAnalyticsApi: () => stableAnalytics,
    inferErrorDomain: () => 'ui',
    setAnalyticsEnabled: jest.fn(),
    trackAnalyticsError: jest.fn(),
    trackAnalyticsEvent: jest.fn(),
    useAnalytics: () => stableAnalytics,
  };
});

jest.unstable_mockModule('@/services/offscreenRenderer', () => ({
  captureOffscreen: (...args: unknown[]) => mockCaptureOffscreen(...args),
}));

jest.unstable_mockModule('@/services/shareService', () => ({
  ShareRequestError: class ShareRequestError extends Error {
    status: number;
    constructor(options: { status: number; message: string }) {
      super(options.message);
      this.status = options.status;
    }
  },
  createShare: (...args: unknown[]) => mockCreateShare(...args),
  uploadThumbnail: (...args: unknown[]) => mockUploadThumbnail(...args),
  getShareApiBase: () => 'http://localhost:3000',
}));

let ShareDialog: typeof import('../ShareDialog').ShareDialog;

describe('ShareDialog', () => {
  beforeAll(async () => {
    ({ ShareDialog } = await import('../ShareDialog'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as typeof globalThis & { TextEncoder: typeof TextEncoder }).TextEncoder =
      TextEncoder;
    (globalThis as typeof globalThis & { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      blob: async () => new Blob(['thumb'], { type: 'image/png' }),
    });
  });

  it('creates a share link and lets the user switch the default mode', async () => {
    mockCreateShare.mockResolvedValue({
      id: 'abc12345',
      url: 'http://localhost:3000/s/abc12345',
      thumbnailUploadToken: 'thumbnail-token',
    });

    render(
      <ThemeProvider>
        <ShareDialog
          isOpen
          onClose={() => {}}
          source={'width = 10; // [5:20]\ncube([width, 10, 5]);'}
          tabName="Bracket"
          forkedFrom={null}
          capturePreview={async () => 'data:image/png;base64,AAA='}
          preview3dUrl={null}
          previewKind="mesh"
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByTestId('share-create-button'));

    await waitFor(() => {
      expect((screen.getByTestId('share-link-input') as HTMLInputElement).value).toBe(
        'http://localhost:3000/s/abc12345'
      );
    });

    fireEvent.click(screen.getByTestId('share-mode-default'));
    expect((screen.getByTestId('share-link-input') as HTMLInputElement).value).toBe(
      'http://localhost:3000/s/abc12345?mode=default'
    );

    fireEvent.click(screen.getByTestId('share-mode-ai-first'));
    expect((screen.getByTestId('share-link-input') as HTMLInputElement).value).toBe(
      'http://localhost:3000/s/abc12345?mode=ai-first'
    );

    await waitFor(() => {
      expect(mockUploadThumbnail).toHaveBeenCalledWith(
        'abc12345',
        expect.any(Blob),
        'thumbnail-token'
      );
    });
  });

  it('shows the share ownership explanation only once after link creation', async () => {
    mockCreateShare.mockResolvedValue({
      id: 'abc12345',
      url: 'http://localhost:3000/s/abc12345',
      thumbnailUploadToken: 'thumbnail-token',
    });

    render(
      <ThemeProvider>
        <ShareDialog
          isOpen
          onClose={() => {}}
          source={'width = 10; // [5:20]\ncube([width, 10, 5]);'}
          tabName="Bracket"
          forkedFrom={null}
          capturePreview={async () => 'data:image/png;base64,AAA='}
          preview3dUrl={null}
          previewKind="mesh"
        />
      </ThemeProvider>
    );

    expect(
      screen.getByText(
        /Anyone with this link will be able to view the design\. They will open their own editable copy/i
      )
    ).toBeTruthy();

    fireEvent.click(screen.getByTestId('share-create-button'));

    await waitFor(() => {
      expect((screen.getByTestId('share-link-input') as HTMLInputElement).value).toBe(
        'http://localhost:3000/s/abc12345'
      );
    });

    expect(
      screen.queryByText(/Anyone with the link can view a copy without changing your original/i)
    ).toBeNull();
  });

  it('uses the generic 3D preview url for mesh thumbnails', async () => {
    mockCreateShare.mockResolvedValue({
      id: 'abc12345',
      url: 'http://localhost:3000/s/abc12345',
      thumbnailUploadToken: 'thumbnail-token',
    });

    render(
      <ThemeProvider>
        <ShareDialog
          isOpen
          onClose={() => {}}
          source={'color("red") cube(10);'}
          tabName="Colored"
          forkedFrom={null}
          capturePreview={async () => 'data:image/png;base64,AAA='}
          preview3dUrl="blob:preview-3d"
          previewKind="mesh"
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByTestId('share-create-button'));

    await waitFor(() => {
      expect(mockCaptureOffscreen).toHaveBeenCalledWith(
        'blob:preview-3d',
        expect.objectContaining({
          view: 'isometric',
          width: 1200,
          height: 630,
        })
      );
    });
  });
});
