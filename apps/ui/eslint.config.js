import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'src-tauri', 'src/vite-env.d.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Ban raw heading and paragraph JSX outside of exempted components.
    // Use <Text> from components/ui instead.
    files: ['**/*.tsx'],
    ignores: [
      'src/components/ui/Text.tsx',
      'src/components/MarkdownMessage.tsx',
      'src/components/ErrorBoundary.tsx',
      'src/components/DiffViewer.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXOpeningElement[name.name="h1"]',
          message: 'Use <Text variant="page-heading"> from components/ui instead of a raw <h1>.',
        },
        {
          selector: 'JSXOpeningElement[name.name="h2"]',
          message:
            'Use <Text variant="panel-title"> or <Text variant="section-heading"> from components/ui instead of a raw <h2>.',
        },
        {
          selector: 'JSXOpeningElement[name.name="h3"]',
          message: 'Use <Text variant="section-heading"> from components/ui instead of a raw <h3>.',
        },
        {
          selector: 'JSXOpeningElement[name.name="h4"]',
          message: 'Use <Text variant="section-heading"> from components/ui instead of a raw <h4>.',
        },
        {
          selector: 'JSXOpeningElement[name.name="p"]',
          message:
            'Use <Text variant="body"> or <Text variant="caption"> from components/ui instead of a raw <p>.',
        },
      ],
    },
  },
  {
    // Ban raw <button> JSX outside of UI primitive components.
    // Use <Button> or <IconButton> from components/ui instead.
    files: ['**/*.tsx'],
    ignores: [
      'src/components/ui/Button.tsx',
      'src/components/ui/IconButton.tsx',
      'src/components/ui/SegmentedControl.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXOpeningElement[name.name="button"]',
          message:
            'Use <Button> or <IconButton> from components/ui instead of a raw <button> element.',
        },
      ],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    ignores: [
      'src/services/renderService.ts',
      'src/services/nativeRenderService.ts',
      'src/services/exportService.ts',
      'src/services/desktopMcp.ts',
      'src/services/__tests__/*.test.ts',
    ],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          property: 'exportModel',
          message:
            'Use exportModelWithContext() for app-level exports. Direct exportModel() calls are reserved for low-level render services and desktop MCP export plumbing.',
        },
      ],
    },
  }
);
