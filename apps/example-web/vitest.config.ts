import { defineConfig } from 'vitest/config'
import { makeCoverage } from '../../packages/config/vitest-coverage.mts'

export default defineConfig({
  test: {
    maxWorkers: process.env.CI ? '100%' : undefined,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // SPA still expanding; low floor, raise with page/component tests.
    coverage: makeCoverage('example-web', {
      statements: 10,
      lines: 10,
      branches: 20,
      functions: 12,
    }),
  },
})
