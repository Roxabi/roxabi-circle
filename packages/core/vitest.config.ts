import { defineConfig } from 'vitest/config'
import { makeCoverage } from '../config/vitest-coverage.mjs'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: makeCoverage('core', {
      statements: 68,
      lines: 69,
      branches: 66,
      functions: 50,
    }),
  },
})
