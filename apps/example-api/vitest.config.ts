import { defineConfig } from 'vitest/config'
import { makeCoverage } from '../../packages/config/vitest-coverage.mjs'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Backend kit bar — keep high; raise further when adding domains.
    coverage: makeCoverage('example-api', {
      statements: 80,
      lines: 80,
      branches: 70,
      functions: 75,
    }),
  },
})
