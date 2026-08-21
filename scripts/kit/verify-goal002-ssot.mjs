import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd())
function read(rel) {
  const p = resolve(root, rel)
  if (!existsSync(p)) throw new Error(`missing: ${rel}`)
  return readFileSync(p, 'utf8')
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const g2 = read('artifacts/goals/002-product-ready-multi-tenant-goal.md')
assert(g2.includes('status: ready-for-goal'), 'goal 002 not ready-for-goal')
assert(g2.includes('D13'), 'goal 002 missing D13 /ship')
assert(g2.includes('## Binary program exit'), 'goal 002 missing binary exit')
assert(g2.includes('## Security pins'), 'goal 002 missing security pins')
assert(g2.includes('B2 HMAC cut'), 'goal 002 missing critical path B2')

const g1 = read('artifacts/goals/001-chemin-a-boilerplate-goal.md')
assert(g1.includes('status: superseded'), 'goal 001 not superseded')
assert(g1.includes('002-product-ready-multi-tenant-goal.md'), 'goal 001 missing superseded_by')

const cut = read('artifacts/specs/14-epic-b2-hmac-cut-ba-only-spec.md')
assert(cut.includes('HMAC cut') || cut.includes('Better Auth only'), 'hmac-cut spec missing')
assert(cut.includes('issue: 14'), 'hmac-cut not issue 14')

const bad = read('artifacts/specs/14-epic-b2-auth-ba-default-spec.md')
assert(
  bad.includes('superseded') || bad.includes('SUPERSEDED'),
  'ba-default must be marked superseded',
)

const prompt = read('artifacts/goals/002-goal-run-prompt.md')
assert(prompt.includes('/plan'), 'prompt missing /plan')
assert(
  prompt.includes('#14') || prompt.includes('issue 14') || prompt.includes('14 (HMAC'),
  'prompt missing #14',
)
assert(prompt.includes('/ship'), 'prompt missing /ship')

// After Wave-1 cut: no public HMAC session path
const sessionPort = read('packages/auth/src/session-port.ts')
assert(!sessionPort.includes('createHmacSessionPort'), 'HMAC SessionPort must be removed')
const index = read('packages/auth/src/index.ts')
assert(!index.includes('createHmacSessionPort'), 'HMAC must not be exported')
const devVars = read('apps/example-api/.dev.vars.example')
assert(
  !devVars.includes('AUTH_SESSION_ADAPTER'),
  'AUTH_SESSION_ADAPTER must be removed from .dev.vars.example',
)
assert(devVars.includes('BETTER_AUTH_SECRET'), 'BETTER_AUTH_SECRET required in .dev.vars.example')

const gap = read('artifacts/goals/002-wave1-gap-and-handoff.md')
assert(gap.includes('W1-G1'), 'gap list missing W1-G1')
assert(gap.includes('/ship'), 'gap handoff missing /ship')
assert(gap.includes('Deferred'), 'gap list missing deferred section')

console.log('OK goal002-ssot-activation verification')
console.log(
  JSON.stringify(
    {
      goal002: 'ready-for-goal',
      goal001: 'superseded',
      wave1Spec: '14-epic-b2-hmac-cut-ba-only-spec.md',
      hmacStillInCode: false,
      handoff: '/plan #14 → implement → /ship',
    },
    null,
    2,
  ),
)
