/**
 * Zero-browser smoke for forbid-prod config (run: bun tooling/release-gifs/smoke-config.mjs)
 */
import { assertNotForbiddenHost, normalizeConfig } from './config.mjs'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

assertNotForbiddenHost('http://127.0.0.1:5173')
assertNotForbiddenHost('http://localhost:3000')
assertNotForbiddenHost('https://app.staging.example.com')

let threw = false
try {
  assertNotForbiddenHost('https://app.example.com')
} catch {
  threw = true
}
ok(threw, 'expected refuse production kit host')

const cfg = normalizeConfig({
  baseURL: 'http://127.0.0.1:5173',
  outDir: '/tmp/gifs',
  statePath: '/tmp/gifs/state.json',
  email: 'demo@kit.local',
  password: 'x',
})
ok(cfg.viewport?.width === 1280, 'viewport default')

console.log('smoke-config: OK')
