import { useState, useEffect, useCallback } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

interface UpdateState {
  isChecking: boolean;
  updateAvailable: Update | null;
  isDownloading: boolean;
  downloadProgress: number;
  error: string | null;
}

export function useUpdater() {
  const [state, setState] = useState<UpdateState>({
    isChecking: false,
    updateAvailable: null,
    isDownloading: false,
    downloadProgress: 0,
    error: null,
  });

  const checkForUpdate = useCallback(async () => {
    setState((prev) => ({ ...prev, isChecking: true, error: null }));
    try {
      const update = await check();
      setState((prev) => ({
        ...prev,
        isChecking: false,
        updateAvailable: update ?? null,
      }));
      return update;
    } catch (err) {
      console.error('Failed to check for updates:', err);
      setState((prev) => ({
        ...prev,
        isChecking: false,
        error: err instanceof Error ? err.message : String(err),
      }));
      return null;
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    if (!state.updateAvailable) return;

    setState((prev) => ({ ...prev, isDownloading: true, error: null }));
    try {
      let downloaded = 0;
      let contentLength = 0;

      await state.updateAvailable.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          contentLength = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          const progress = contentLength > 0 ? (downloaded / contentLength) * 100 : 0;
          setState((prev) => ({ ...prev, downloadProgress: progress }));
        } else if (event.event === 'Finished') {
          setState((prev) => ({ ...prev, downloadProgress: 100 }));
        }
      });
      await relaunch();
    } catch (err) {
      console.error('Failed to download/install update:', err);
      setState((prev) => ({
        ...prev,
        isDownloading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [state.updateAvailable]);

  const dismissUpdate = useCallback(() => {
    setState((prev) => ({ ...prev, updateAvailable: null }));
  }, []);

  // Check for updates on mount
  useEffect(() => {
    checkForUpdate();
  }, [checkForUpdate]);

  return {
    ...state,
    checkForUpdate,
    downloadAndInstall,
    dismissUpdate,
  };
}
