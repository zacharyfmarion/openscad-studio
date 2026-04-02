/** @jest-environment jsdom */

import { screen } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import { AiAccessEmptyState } from '../AiAccessEmptyState';

describe('AiAccessEmptyState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('expands Claude Code by default in the panel variant', () => {
    renderWithProviders(<AiAccessEmptyState variant="panel" onOpenSettings={() => {}} />);

    expect(screen.getByText('Use built-in AI or Studio MCP')).toBeTruthy();
    expect(screen.getByText(/claude mcp add --transport http --scope user/i)).toBeTruthy();
    expect(screen.getByText(/select_workspace with your repo root/i)).toBeTruthy();
    expect(screen.queryByText(/codex mcp add openscad-studio --url/i)).toBeNull();
  });
});
