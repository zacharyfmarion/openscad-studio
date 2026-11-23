import { invoke } from '@tauri-apps/api/core';
import { getPlatform } from '../platform';
import { loadSettings, updateSetting } from '../stores/settingsStore';

export interface ScadDefaultHandlerStatus {
  /** False on unsupported platforms or when not running from the installed app bundle. */
  supported: boolean;
  isDefault: boolean;
}

const UNSUPPORTED_STATUS: ScadDefaultHandlerStatus = { supported: false, isDefault: false };

/** Returns the `.scad` file the OS asked to open at launch (desktop only). */
export async function takeStartupOpenFile(): Promise<string | null> {
  return invoke<string | null>('take_startup_open_file');
}

export async function getScadDefaultHandlerStatus(): Promise<ScadDefaultHandlerStatus> {
  if (!getPlatform().capabilities.hasFileSystem) {
    return UNSUPPORTED_STATUS;
  }
  return invoke<ScadDefaultHandlerStatus>('get_scad_default_handler_status');
}

export async function setAsDefaultScadHandler(): Promise<void> {
  await invoke('set_as_default_scad_handler');
}

/**
 * Asks once whether OpenSCAD Studio should become the default app for `.scad`
 * files. Skipped when it already is, or after the user has answered.
 */
export async function maybePromptForDefaultScadHandler(): Promise<void> {
  const { ui } = loadSettings();
  if (ui.hasAnsweredDefaultScadHandlerPrompt || !ui.hasCompletedNux) {
    return;
  }

  const status = await getScadDefaultHandlerStatus();
  if (!status.supported || status.isDefault) {
    return;
  }

  const platform = getPlatform();
  const accepted = await platform.ask(
    'Do you want to make OpenSCAD Studio the default app for .scad files? Double-clicking a .scad file will open it here instead of OpenSCAD. You can change this later in Settings.',
    {
      title: 'Default App for .scad Files',
      kind: 'info',
      okLabel: 'Make Default',
      cancelLabel: 'Not Now',
    }
  );
  updateSetting('ui', { hasAnsweredDefaultScadHandlerPrompt: true });

  if (accepted) {
    await setAsDefaultScadHandler();
  }
}
