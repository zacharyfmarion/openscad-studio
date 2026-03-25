/** @jest-environment jsdom */

import { render, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import { ChatImage, ChatImageGrid } from '../ChatImage';

// Mock yet-another-react-lightbox since it relies on browser APIs not in jsdom
jest.mock('yet-another-react-lightbox', () => ({
  __esModule: true,
  default: ({ open, close }: { open: boolean; close: () => void }) =>
    open ? <div data-testid="lightbox" onClick={close} /> : null,
}));
jest.mock('yet-another-react-lightbox/plugins/zoom', () => ({ __esModule: true, default: {} }));
jest.mock('yet-another-react-lightbox/plugins/captions', () => ({
  __esModule: true,
  default: {},
}));
jest.mock('yet-another-react-lightbox/styles.css', () => ({}));
jest.mock('yet-another-react-lightbox/plugins/captions.css', () => ({}));

describe('ChatImage', () => {
  it('renders image with correct src and alt', () => {
    render(<ChatImage src="https://example.com/img.png" alt="test image" />);
    // img starts hidden (display:none) until onLoad fires
    const img = screen.getByRole('img', { hidden: true });
    expect(img).toBeDefined();
    expect(img.getAttribute('src')).toBe('https://example.com/img.png');
    expect(img.getAttribute('alt')).toBe('test image');
  });

  it('shows broken-image placeholder when onError fires', () => {
    render(<ChatImage src="bad-url" alt="broken" />);
    const img = screen.getByRole('img', { hidden: true });
    fireEvent.error(img);
    expect(screen.getByText('Unavailable')).toBeDefined();
    expect(screen.queryByRole('img', { hidden: true })).toBeNull();
  });

  it('opens lightbox when image container is clicked', () => {
    render(<ChatImage src="https://example.com/img.png" alt="test" />);
    const img = screen.getByRole('img', { hidden: true });
    fireEvent.load(img);
    // Click the wrapper div (parent of img)
    fireEvent.click(img.parentElement!);
    expect(screen.getByTestId('lightbox')).toBeDefined();
  });

  it('closes lightbox when close is triggered', () => {
    render(<ChatImage src="https://example.com/img.png" alt="test" />);
    const img = screen.getByRole('img', { hidden: true });
    fireEvent.load(img);
    fireEvent.click(img.parentElement!);
    const lightbox = screen.getByTestId('lightbox');
    fireEvent.click(lightbox); // triggers close()
    expect(screen.queryByTestId('lightbox')).toBeNull();
  });
});

describe('ChatImageGrid', () => {
  it('renders nothing when images array is empty', () => {
    const { container } = render(<ChatImageGrid images={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when all images have empty src', () => {
    const { container } = render(<ChatImageGrid images={[{ src: '', filename: 'test.png' }]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a flex container for any number of images', () => {
    const { container } = render(
      <ChatImageGrid images={[{ src: 'https://example.com/a.png', filename: 'a.png' }]} />
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.style.display).toBe('flex');
    expect(grid.style.flexWrap).toBe('wrap');
  });

  it('renders all valid images as thumbnails', () => {
    const { container } = render(
      <ChatImageGrid
        images={[
          { src: 'https://example.com/a.png', filename: 'a.png' },
          { src: 'https://example.com/b.png', filename: 'b.png' },
          { src: 'https://example.com/c.png', filename: 'c.png' },
        ]}
      />
    );
    // 3 images → 3 child wrappers
    expect(container.firstChild?.childNodes.length).toBe(3);
  });
});
