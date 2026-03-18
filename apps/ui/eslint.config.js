import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'src-tauri'] },
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
  }
);
