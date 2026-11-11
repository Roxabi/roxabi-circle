import { defineConfig } from 'vitest/config'
import { makeCoverage } from '../config/vitest-coverage.mts'

export default defineConfig({
  test: {
    maxWorkers: process.env.CI ? '100%' : undefined,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: makeCoverage('flows', {
      statements: 80,
      lines: 80,
      branches: 70,
      functions: 80,
    }),
  },
})
