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
    doRender: () => void;
    manualRender: () => void;
    updateSourceAndRender: (source: string) => void;
    dimensionMode: string;
    renderService: any;
  };
}
