import { defineConfig } from 'vitest/config'
import { makeCoverage } from '../config/vitest-coverage.mjs'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: makeCoverage('storage', {
      statements: 70,
      lines: 70,
      branches: 60,
      functions: 70,
    }),
  },
})
