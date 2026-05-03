/** @jest-environment jsdom */

import { screen } from '@testing-library/react';
import { AnnotationBadge } from '../ui';
import { renderWithProviders } from './test-utils';

describe('AnnotationBadge', () => {
  it('renders compact badge copy with the accent treatment by default', () => {
    renderWithProviders(<AnnotationBadge>New</AnnotationBadge>);

    const badge = screen.getByText('New');

    expect(badge.tagName).toBe('SPAN');
    expect(badge.getAttribute('data-tone')).toBe('accent');
    expect(badge.className).toContain('uppercase');
    expect(badge.className).toContain('border');
  });

  it('supports neutral badges for future reuse', () => {
    renderWithProviders(
      <AnnotationBadge tone="neutral" className="tracking-tight">
        Beta
      </AnnotationBadge>
    );

    const badge = screen.getByText('Beta');

    expect(badge.getAttribute('data-tone')).toBe('neutral');
    expect(badge.className).toContain('tracking-tight');
  });
});
