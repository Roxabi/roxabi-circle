import { defineConfig } from 'vitest/config'
import { makeCoverage } from '../config/vitest-coverage.mjs'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: makeCoverage('comments', {
      statements: 75,
      lines: 75,
      branches: 55,
      functions: 75,
    }),
  },
})
