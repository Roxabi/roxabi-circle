import { defineConfig } from 'vitest/config'
import { makeCoverage } from '../config/vitest-coverage.mjs'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: makeCoverage('email', {
      statements: 50,
      lines: 50,
      branches: 40,
      functions: 40,
    }),
  },
})
