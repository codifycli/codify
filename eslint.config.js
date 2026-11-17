import oclif from 'eslint-config-oclif'
import prettier from 'eslint-config-prettier'

export default [
  {
    ignores: ['dist/', 'node_modules/', 'tmp/', '**/*.test.ts', '**/*.test.tsx'],
  },
  ...oclif,
  prettier,
  {
    rules: {
      '@stylistic/object-curly-spacing': ['warn', 'always'],
      'perfectionist/sort-classes': 'off',
      'perfectionist/sort-interfaces': 'off',
      'perfectionist/sort-enums': 'off',
      'perfectionist/sort-objects': 'off',
      'perfectionist/sort-object-types': 'off',
      'unicorn/no-array-reduce': 'off',
      'unicorn/no-array-for-each': 'off',
      'unicorn/prefer-object-from-entries': 'off',
      'unicorn/prefer-type-error': 'off',
      'unicorn/no-static-only-class': 'off',
      '@typescript-eslint/no-duplicate-enum-values': 'off',
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      'no-await-in-loop': 'off',
    },
  },
]
