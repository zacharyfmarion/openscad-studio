# Share-Link Load Jank Fix

- [x] Add a dedicated share-entry Zustand store and orchestration hook.
- [x] Move share boot/session state out of `App.tsx` local state.
- [x] Suppress default untitled-document render during share entry.
- [x] Add preview visual-ready callbacks for 2D and 3D viewers.
- [x] Keep one share-specific blocking loader visible until the first preview is visually ready.
- [x] Remove duplicate share-entry renders and `setTimeout` boot sequencing.
- [x] Add focused store/orchestration/workspace tests.
- [x] Verify with targeted tests and `pnpm web:build`.
