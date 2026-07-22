//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    ignores: ['.vite/**', 'dist/**', 'eslint.config.js', 'prettier.config.js'],
  },
]
