/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Augment the Window interface with test-only globals.
 * These are set conditionally in DEV mode or when __PLAYWRIGHT__ is true.
 */
interface Window {
  __PLAYWRIGHT__?: boolean;
  __TEST_EDITOR__?: import('monaco-editor').editor.IStandaloneCodeEditor;
  __TEST_MONACO__?: typeof import('monaco-editor');
  __TEST_OPENSCAD__?: {
    doRender: (
      code: string,
      dimension?: '2d' | '3d',
      trigger?: import('./analytics/runtime').RenderTrigger
    ) => Promise<void>;
    manualRender: () => void;
    updateSourceAndRender: (
      source: string,
      trigger?: import('./analytics/runtime').RenderTrigger
    ) => void;
    renderWithTrigger: (trigger: import('./analytics/runtime').RenderTrigger) => void;
    dimensionMode: string;
    renderService: any;
    setTestAuxiliaryFiles: (files: Record<string, string>) => void;
  };
}
