/**
 * Shared Vitest coverage options for the monorepo.
 * Reports land in <repo>/coverage/<name>/ (html + json-summary + text).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * @param {string} name report folder under coverage/
 * @param {{
 *   statements?: number
 *   branches?: number
 *   functions?: number
 *   lines?: number
 * }} [thresholds]
 */
export function makeCoverage(name, thresholds) {
  return {
    provider: 'v8',
    reportsDirectory: path.join(REPO_ROOT, 'coverage', name),
    reporter: ['text', 'html', 'json-summary'],
    reportOnFailure: true,
    include: ['src/**/*.{ts,tsx}'],
    exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/**/*.d.ts', '**/node_modules/**'],
    clean: true,
    ...(thresholds
      ? {
          thresholds: {
            statements: thresholds.statements,
            branches: thresholds.branches,
            functions: thresholds.functions,
            lines: thresholds.lines,
          },
        }
      : {}),
  }
}
