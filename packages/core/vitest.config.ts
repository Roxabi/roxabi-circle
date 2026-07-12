import { defineConfig } from 'vitest/config'
import { makeCoverage } from '../config/vitest-coverage.mjs'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: makeCoverage('core', {
      statements: 75,
      lines: 75,
      branches: 70,
      functions: 50,
    }),
  },
})
