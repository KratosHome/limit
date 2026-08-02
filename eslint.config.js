import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

const kebabCaseComponentFilenames = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      invalid:
        'React component filenames must use kebab-case, for example `app-overlays.tsx`.',
    },
  },
  create(context) {
    return {
      Program(node) {
        const filename = context.filename
          .replaceAll('\\', '/')
          .split('/')
          .at(-1);
        if (!filename?.endsWith('.tsx')) return;

        const basename = filename?.replace(/\.tsx$/u, '');

        if (basename && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(basename)) {
          context.report({ node, messageId: 'invalid' });
        }
      },
    };
  },
};

export default defineConfig([
  globalIgnores(['dist/**', 'release/**', 'node_modules/**']),
  js.configs.recommended,
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx}'],
  })),
  {
    files: ['src/**/*.{ts,tsx}', 'vite.config.ts'],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports', prefer: 'type-imports' },
      ],
      'no-duplicate-imports': ['error', { allowSeparateTypeImports: false }],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "TSQualifiedName[left.type='Identifier'][left.name='React']",
          message:
            'Import React types directly with `import type` instead of using the React namespace.',
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      project: {
        rules: {
          'kebab-case-component-filenames': kebabCaseComponentFilenames,
        },
      },
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'project/kebab-case-component-filenames': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ['electron/**/*.cjs', 'scripts/**/*.cjs'],
    languageOptions: {
      globals: globals.node,
      sourceType: 'commonjs',
    },
    rules: {
      'no-redeclare': 'off',
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
]);
