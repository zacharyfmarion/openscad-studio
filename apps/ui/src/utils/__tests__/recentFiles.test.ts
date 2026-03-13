/** @jest-environment jsdom */

import { jest } from '@jest/globals';
import {
  addRecentFile,
  loadRecentFiles,
  pruneRecentFiles,
  removeRecentFile,
  saveRecentFiles,
} from '../recentFiles';

describe('recentFiles', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.spyOn(Date, 'now').mockReturnValueOnce(1).mockReturnValueOnce(2);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prunes duplicates and keeps the newest entries first', () => {
    const pruned = pruneRecentFiles([
      { path: '/tmp/a.scad', name: 'a.scad', lastOpened: 1 },
      { path: '/tmp/b.scad', name: 'b.scad', lastOpened: 4 },
      { path: '/tmp/a.scad', name: 'a.scad', lastOpened: 5 },
      { path: '/tmp/c.scad', name: 'c.scad', lastOpened: 3 },
      { path: '/tmp/d.scad', name: 'd.scad', lastOpened: 2 },
    ]);

    expect(pruned).toEqual([
      { path: '/tmp/a.scad', name: 'a.scad', lastOpened: 5 },
      { path: '/tmp/b.scad', name: 'b.scad', lastOpened: 4 },
      { path: '/tmp/c.scad', name: 'c.scad', lastOpened: 3 },
    ]);
  });

  it('persists and reloads pruned recent files', () => {
    saveRecentFiles([
      { path: '/tmp/a.scad', name: 'a.scad', lastOpened: 1 },
      { path: '/tmp/b.scad', name: 'b.scad', lastOpened: 2 },
      { path: '/tmp/c.scad', name: 'c.scad', lastOpened: 3 },
      { path: '/tmp/d.scad', name: 'd.scad', lastOpened: 4 },
    ]);

    expect(loadRecentFiles()).toEqual([
      { path: '/tmp/d.scad', name: 'd.scad', lastOpened: 4 },
      { path: '/tmp/c.scad', name: 'c.scad', lastOpened: 3 },
      { path: '/tmp/b.scad', name: 'b.scad', lastOpened: 2 },
    ]);
  });

  it('adds and removes recent files by path', () => {
    addRecentFile('/tmp/a.scad');
    addRecentFile('/tmp/b.scad');

    expect(loadRecentFiles().map((file) => file.path)).toEqual(['/tmp/b.scad', '/tmp/a.scad']);

    removeRecentFile('/tmp/a.scad');

    expect(loadRecentFiles().map((file) => file.path)).toEqual(['/tmp/b.scad']);
  });
});
