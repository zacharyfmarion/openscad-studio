/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { TextEncoder } from 'util';
import { ShareDialog } from '../ShareDialog';
import { ThemeProvider } from '../../contexts/ThemeContext';

const mockTrack = jest.fn();
const mockCreateShare = jest.fn();
const mockUploadThumbnail = jest.fn();

jest.mock('../../analytics/runtime', () => ({
  useAnalytics: () => ({
    track: (...args: unknown[]) => mockTrack(...args),
    trackError: jest.fn(),
    setAnalyticsEnabled: jest.fn(),
  }),
}));

jest.mock('../../services/offscreenRenderer', () => ({
  captureOffscreen: jest.fn(async () => 'data:image/png;base64,AAA='),
}));

jest.mock('../../services/shareService', () => ({
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

describe('ShareDialog', () => {
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
          stlBlobUrl={null}
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

    fireEvent.click(screen.getByTestId('share-mode-editor'));
    expect((screen.getByTestId('share-link-input') as HTMLInputElement).value).toBe(
      'http://localhost:3000/s/abc12345?mode=editor'
    );

    await waitFor(() => {
      expect(mockUploadThumbnail).toHaveBeenCalledWith(
        'abc12345',
        expect.any(Blob),
        'thumbnail-token'
      );
    });
  });
});
