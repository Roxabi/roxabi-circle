// @vitest-environment node

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'
import type { JsonTestResults } from 'vitest/node'

it('preserves both teardown failures and the next consumer', { timeout: 30_000 }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'web-finalization-'))
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }))
  const reportPath = join(directory, 'report.json')
  const runnerPath = fileURLToPath(
    new URL('./shared-finalization.child-runner.mjs', import.meta.url),
  )
  const child = spawnSync(process.execPath, [runnerPath, reportPath], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    encoding: 'utf8',
    env: { ...process.env, NODE_V8_COVERAGE: undefined },
    timeout: 20_000,
  })

  expect(child.error, child.stderr).toBeUndefined()
  expect(child.status, child.stdout + child.stderr).toBe(1)
  const report: JsonTestResults = JSON.parse(readFileSync(reportPath, 'utf8'))
  expect(report.numTotalTests).toBe(2)
  expect(report.numFailedTests).toBe(1)
  expect(report.numPassedTests).toBe(1)
  const assertions = report.testResults.flatMap((result) => result.assertionResults)
  const failed = assertions.find(
    (result) => result.title === 'retains independent consumer and finalizer diagnostics',
  )
  expect(failed?.status).toBe('failed')
  const messages = failed?.failureMessages ?? []
  const consumerDiagnostic = messages.find((message) =>
    message.includes('WEB_FINALIZATION_CONSUMER_AFTER_EACH_MARKER'),
  )
  const runtimeDiagnostic = messages.find((message) =>
    message.includes('WEB_FINALIZATION_UNDECLARED_RUNTIME_MARKER'),
  )
  expect(consumerDiagnostic).toContain('WEB_FINALIZATION_CONSUMER_AFTER_EACH_MARKER')
  expect(runtimeDiagnostic).toContain('WEB_FINALIZATION_UNDECLARED_RUNTIME_MARKER')
  expect(runtimeDiagnostic).not.toBe(consumerDiagnostic)
  expect(
    assertions.find(
      (result) => result.title === 'runs with restored support after the failed teardown',
    )?.status,
  ).toBe('passed')
  expect(child.stdout.split(/\r?\n/)).toContain('WEB_FINALIZATION_NEXT_BODY_MARKER')
  expect(child.stderr).not.toContain('RangeError')
})
