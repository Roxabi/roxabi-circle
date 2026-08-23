/**
 * @kit/flows/run — Workflow driver for snapshot-only flow runs (ADR-0005).
 *
 * Worker/D1 surface: import from `@kit/flows/run`, not the root export, so
 * Cloudflare types do not leak into SPA bundles.
 *
 * - `driveFlowRun` — claim, parse RunnerView, interpret waves, invoke/infer steps
 * - `claimRun` / `loadRun` / `persistBundle` — D1 persist via drizzle schema + repos
 * - `DriveNonRetryableError` — map to Workflow NonRetryableError in the app shell
 */

export {
  DriveNonRetryableError,
  type DriveStep,
  driveFlowRun,
  type InferPort,
  type InvokePort,
} from './drive'
export { INVOKE_ONLY_PLAN_YAML, TWO_SIBLING_INVOKE_PLAN_YAML } from './fixtures'
export { claimRun, type FlowRunRow, loadRun, persistBundle } from './persist'
