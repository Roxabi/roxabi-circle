import { defineConfig } from 'vitest/config'
import { makeCoverage } from '../config/vitest-coverage.mts'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: makeCoverage('notifications', {
      statements: 90,
      lines: 90,
      branches: 85,
      functions: 90,
    }),
  },
})
