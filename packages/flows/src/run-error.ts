import type { InterpretStuckCode } from './interpret'

/**
 * Codes written to `flow_runs.error_code` by the runner and the workflow bind.
 * Stuck codes are a subset: adding one without listing it fails this file.
 */
export const FLOW_RUN_ERROR_CODES = [
  'CYCLE',
  'UNKNOWN_TASK_EDGE',
  'DAG_STUCK',
  'WAITING_NOT_SUPPORTED',
  'RUNNER_VIEW_INVALID',
  'ORG_MISMATCH',
  'RECEIPTS_INVALID',
  'APPROVAL_REJECTED',
  'APPROVAL_TIMEOUT',
  'APPROVAL_UNSUPPORTED',
  'WORKFLOW_CREATE_FAILED',
  'INVOKE_FAILED',
  'INFER_FAILED',
  'TOKEN_CEILING',
  'UNKNOWN_TOOL',
  'TOOL_NOT_IN_EXECUTION_TOOLS',
  'BINDING_UNRESOLVED',
] as const

export type FlowRunErrorCode = (typeof FLOW_RUN_ERROR_CODES)[number]

const _stuckCovered = {
  CYCLE: 'CYCLE',
  UNKNOWN_TASK_EDGE: 'UNKNOWN_TASK_EDGE',
  DAG_STUCK: 'DAG_STUCK',
  WAITING_NOT_SUPPORTED: 'WAITING_NOT_SUPPORTED',
} as const satisfies Record<InterpretStuckCode, FlowRunErrorCode>

void _stuckCovered
