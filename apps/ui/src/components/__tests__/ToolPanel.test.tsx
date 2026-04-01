/** @jest-environment jsdom */

import { render, screen, fireEvent } from '@testing-library/react';
import { ToolPanel } from '../three-viewer/panels/ToolPanel';

describe('ToolPanel', () => {
  it('renders label in header', () => {
    render(<ToolPanel label="Measure">content</ToolPanel>);
    expect(screen.getByText('Measure')).toBeInTheDocument();
  });

  it('keeps a bounded flex layout so child panels can scroll internally', () => {
    render(<ToolPanel label="Measure">content</ToolPanel>);
    const panel = screen.getByRole('button').parentElement;

    expect(panel).toHaveClass('flex', 'flex-col', 'max-h-[calc(100%-1.5rem)]');
  });

  it('shows children when expanded (default)', () => {
    render(<ToolPanel label="Test">child content</ToolPanel>);
    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('hides children when collapsed', () => {
    render(<ToolPanel label="Test">child content</ToolPanel>);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByText('child content')).not.toBeInTheDocument();
  });

  it('toggles expanded state on header click', () => {
    render(<ToolPanel label="Test">child content</ToolPanel>);
    const btn = screen.getByRole('button');

    expect(btn).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('starts collapsed when defaultExpanded is false', () => {
    render(
      <ToolPanel label="Test" defaultExpanded={false}>
        child content
      </ToolPanel>
    );
    expect(screen.queryByText('child content')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });
});
