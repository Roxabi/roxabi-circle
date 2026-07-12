import { defineConfig } from 'vitest/config'
import { makeCoverage } from '../config/vitest-coverage.mjs'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // UI surface is large; raise thresholds as component tests grow.
    coverage: makeCoverage('ui', {
      statements: 20,
      lines: 20,
      branches: 50,
      functions: 40,
    }),
  },
})
