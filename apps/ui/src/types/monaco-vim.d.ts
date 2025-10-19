declare module 'monaco-vim' {
  export function initVimMode(
    editor: any,
    statusBar: HTMLElement
  ): { dispose: () => void };

  export const VimMode: any;
  export const Vim: any;
}
