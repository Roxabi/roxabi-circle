/**
 * Shared Vitest coverage options for the monorepo.
 * Reports land in <repo>/coverage/<name>/ (html + json-summary + text).
 *
 * `packages/config/` is a tooling-asset directory, not a Package: no manifest, no
 * `@kit/config`, no runtime, no tests. Both assets here are consumed by relative
 * path — see `docs/kit/standards/stack.md` § H (decision Roxabi/roxabi-boilerplate-cf#245).
 *
 * TypeScript on purpose: Vite/Vitest transpile the config graph before loading
 * it, so a `.mts` helper needs no build step, and `typecheck:tooling` opens
 * this file twice over: as a root `include` glob for the packages' `.mts`, and
 * through the workspaces' `vitest.config.ts` files that import it. The types below are the
 * implementation's own — no side-car `.d.mts` to drift from what it returns.
 *
 * Vitest 4: restore ignoreEmptyLines (Vitest 3 default). Threshold floors may be
 * recalibrated when v8 remapping shifts metrics — see issue Roxabi/roxabi-boilerplate-cf#21 inventory note.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Per-metric coverage floors, in percent. */
export interface CoverageThresholds {
  statements?: number
  branches?: number
  functions?: number
  lines?: number
}

/** Coverage options accepted by `defineConfig({ test: { coverage } })`. */
export interface SharedCoverageOptions {
  provider: 'v8'
  reportsDirectory: string
  reporter: ('text' | 'html' | 'json-summary')[]
  reportOnFailure: boolean
  ignoreEmptyLines: boolean
  include: string[]
  exclude: string[]
  clean: boolean
  thresholds?: CoverageThresholds
}

/**
 * Build the shared coverage options.
 *
 * @param name report folder under `coverage/`
 * @param thresholds per-metric floors; omitted means no enforcement
 */
export function makeCoverage(name: string, thresholds?: CoverageThresholds): SharedCoverageOptions {
  return {
    provider: 'v8',
    reportsDirectory: path.join(REPO_ROOT, 'coverage', name),
    reporter: ['text', 'html', 'json-summary'],
    reportOnFailure: true,
    ignoreEmptyLines: true,
    include: ['src/**/*.{ts,tsx}'],
    exclude: [
      'src/**/*.test.{ts,tsx}',
      'src/**/test/**',
      'src/**/test-setup.{ts,tsx}',
      // Private repo fixtures and Node-only Worker aliases are support, not runtime.
      'src/repos/memory-d1.ts',
      'src/cloudflare-workers-stub.ts',
      'src/**/*.d.ts',
      '**/node_modules/**',
    ],
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
