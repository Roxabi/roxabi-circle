import { defineConfig } from 'vitest/config'
import { makeCoverage } from '../../packages/config/vitest-coverage.mjs'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: makeCoverage('mcp-example', {
      statements: 50,
      lines: 50,
      branches: 40,
      // tool handlers are registered, not invoked in unit tests
      functions: 0,
    }),
  },
})
