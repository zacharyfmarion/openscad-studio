declare module 'monaco-vim' {
  import type * as Monaco from 'monaco-editor';

  export function initVimMode(
    editor: Monaco.editor.IStandaloneCodeEditor,
    statusBar: HTMLElement
  ): { dispose: () => void };

  export const VimMode: unknown;
  export const Vim: {
    map: (from: string, to: string, mode?: string) => void;
    imap: (from: string, to: string) => void;
    nmap: (from: string, to: string) => void;
    vmap: (from: string, to: string) => void;
  };
}
