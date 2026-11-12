import { defineConfig } from 'vitest/config'
import { makeCoverage } from '../config/vitest-coverage.mts'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: makeCoverage('i18n', {
      statements: 70,
      lines: 70,
      branches: 50,
      functions: 50,
    }),
  },
})
