import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'android', 'assets', 'node_modules', 'sim/out', '.cache'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Les boucles chaudes utilisent des for indexés sur des TypedArrays.
      '@typescript-eslint/prefer-for-of': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Frontières d'import : la simulation reste indépendante du rendu et de la plateforme.
    files: ['src/{engine,systems,content,modes,meta}/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'pixi.js',
                'pixi.js/*',
                'react',
                'react/*',
                'react-dom',
                'react-dom/*',
                'zustand',
                '@capacitor/*',
              ],
              message:
                'La simulation ne dépend ni du rendu, ni de React, ni de Capacitor (docs/ARCHITECTURE.md §3).',
            },
            {
              group: ['**/render/**', '**/ui/**', '**/audio/**', '**/platform/**', '**/state/**'],
              message:
                "La simulation communique uniquement par la file d'événements (docs/ARCHITECTURE.md §3).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['*.config.{js,ts}', 'scripts/**', 'sim/**'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  prettier,
);
