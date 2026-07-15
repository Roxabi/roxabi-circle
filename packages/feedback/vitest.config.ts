import { defineConfig } from 'vitest/config'
import { makeCoverage } from '../config/vitest-coverage.mjs'

const coverageBase = makeCoverage('feedback', {
  statements: 50,
  lines: 50,
  branches: 40,
  functions: 40,
})

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      ...coverageBase,
      // React UI is exercised via example-web; core + hono are unit-tested here.
      exclude: [...(coverageBase.exclude ?? []), 'src/react/**', 'src/index.ts', 'src/types.ts'],
    },
  },
})
