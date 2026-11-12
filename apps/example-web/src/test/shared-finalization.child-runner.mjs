import { fileURLToPath } from 'node:url'
import { startVitest } from 'vitest/node'

const vitest = await startVitest([], {
  root: fileURLToPath(new URL('../../', import.meta.url)),
  config: 'vitest.config.ts',
  include: [fileURLToPath(new URL('./shared-finalization.child.ts', import.meta.url))],
  reporters: ['json'],
  outputFile: process.argv[2],
  watch: false,
  fileParallelism: false,
  disableConsoleIntercept: true,
  coverage: { enabled: false },
})
await vitest.close()
