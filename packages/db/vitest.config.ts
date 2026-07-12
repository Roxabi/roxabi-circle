import { defineConfig } from 'vitest/config'
import { makeCoverage } from '../config/vitest-coverage.mjs'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: makeCoverage('db', {
      statements: 70,
      lines: 70,
      branches: 50,
      functions: 50,
    }),
  },
})
