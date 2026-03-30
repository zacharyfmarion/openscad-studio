/** @jest-environment jsdom */

import { fireEvent, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { FileTreeItem } from '../FileTree/FileTreeItem';
import { renderWithProviders } from './test-utils';

const defaultProps = {
  name: 'main.scad',
  fullPath: 'main.scad',
  isActive: true,
  isDirty: false,
  isRenderTarget: false,
  onClick: jest.fn(),
  onRename: jest.fn(),
  onDelete: jest.fn(),
  onSetRenderTarget: jest.fn(),
};

describe('FileTreeItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the file name', () => {
    renderWithProviders(<FileTreeItem {...defaultProps} />);
    expect(screen.getByText('main.scad')).toBeTruthy();
  });

  it('enters rename mode on Enter key and allows multi-character typing', () => {
    renderWithProviders(<FileTreeItem {...defaultProps} />);

    const button = screen.getByRole('button', { name: 'main.scad' });
    fireEvent.keyDown(button, { key: 'Enter' });

    const input = screen.getByTestId('rename-input');
    expect(input).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe('main.scad');

    // Simulate typing a full multi-character filename
    fireEvent.change(input, { target: { value: 'utils.scad' } });
    expect((input as HTMLInputElement).value).toBe('utils.scad');

    // Type more characters — must not get clobbered
    fireEvent.change(input, { target: { value: 'utils_v2.scad' } });
    expect((input as HTMLInputElement).value).toBe('utils_v2.scad');
  });

  it('commits rename on Enter key in input', () => {
    renderWithProviders(<FileTreeItem {...defaultProps} />);

    const button = screen.getByRole('button', { name: 'main.scad' });
    fireEvent.keyDown(button, { key: 'Enter' });

    const input = screen.getByTestId('rename-input');
    fireEvent.change(input, { target: { value: 'renamed.scad' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(defaultProps.onRename).toHaveBeenCalledWith('main.scad', 'renamed.scad');
    // Should exit rename mode
    expect(screen.queryByTestId('rename-input')).toBeNull();
  });

  it('cancels rename on Escape without calling onRename', () => {
    renderWithProviders(<FileTreeItem {...defaultProps} />);

    const button = screen.getByRole('button', { name: 'main.scad' });
    fireEvent.keyDown(button, { key: 'Enter' });

    const input = screen.getByTestId('rename-input');
    fireEvent.change(input, { target: { value: 'something_else.scad' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(defaultProps.onRename).not.toHaveBeenCalled();
    expect(screen.queryByTestId('rename-input')).toBeNull();
  });

  it('does not call onRename when name is unchanged', () => {
    renderWithProviders(<FileTreeItem {...defaultProps} />);

    const button = screen.getByRole('button', { name: 'main.scad' });
    fireEvent.keyDown(button, { key: 'Enter' });

    const input = screen.getByTestId('rename-input');
    // Submit without changing value
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(defaultProps.onRename).not.toHaveBeenCalled();
  });

  it('commits rename on blur', () => {
    renderWithProviders(<FileTreeItem {...defaultProps} />);

    const button = screen.getByRole('button', { name: 'main.scad' });
    fireEvent.keyDown(button, { key: 'Enter' });

    const input = screen.getByTestId('rename-input');
    fireEvent.change(input, { target: { value: 'blurred.scad' } });
    fireEvent.blur(input);

    expect(defaultProps.onRename).toHaveBeenCalledWith('main.scad', 'blurred.scad');
  });
});
