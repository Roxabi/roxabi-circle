import { defineConfig } from 'vitest/config'
import { makeCoverage } from '../config/vitest-coverage.mts'

const coverage = makeCoverage('comments', {
  statements: 75,
  lines: 75,
  branches: 55,
  functions: 75,
})

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage,
  },
})
