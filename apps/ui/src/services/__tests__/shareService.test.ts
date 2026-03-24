/** @jest-environment jsdom */

import { jest } from '@jest/globals';
import {
  createShare,
  getShare,
  ShareRequestError,
  uploadThumbnail,
} from '../shareService';

function createMockResponse(body: unknown, init: { status: number }) {
  return {
    ok: init.status >= 200 && init.status < 300,
    status: init.status,
    json: async () => body,
  } as Response;
}

describe('shareService', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    (globalThis as typeof globalThis & { fetch: jest.Mock }).fetch = jest.fn();
  });

  it('posts share creation requests and returns the response payload', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      createMockResponse(
        {
          id: 'abc12345',
          url: 'https://openscad-studio.pages.dev/s/abc12345',
          thumbnailUploadToken: 'token-123',
        },
        { status: 200 }
      )
    );

    const result = await createShare({
      code: 'cube(10);',
      title: 'Cube',
      forkedFrom: null,
    });

    expect(result).toEqual({
      id: 'abc12345',
      url: 'https://openscad-studio.pages.dev/s/abc12345',
      thumbnailUploadToken: 'token-123',
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/share'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      })
    );
  });

  it('throws a typed error for failed share loads', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      createMockResponse({ error: 'Design not found' }, { status: 404 })
    );

    await expect(getShare('missing')).rejects.toEqual(
      expect.objectContaining<Partial<ShareRequestError>>({
        name: 'ShareRequestError',
        status: 404,
        message: 'Design not found',
      })
    );
  });

  it('sends the thumbnail upload bearer token', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      createMockResponse({ thumbnailUrl: 'https://example.com/thumb.png' }, { status: 200 })
    );

    await uploadThumbnail(
      'abc12345',
      new Blob(['test'], { type: 'image/png' }),
      'thumbnail-token'
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/share/abc12345/thumbnail'),
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          Authorization: 'Bearer thumbnail-token',
          'Content-Type': 'image/png',
        }),
      })
    );
  });
});
