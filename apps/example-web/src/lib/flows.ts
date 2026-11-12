import { apiFetch, HttpError } from './api'

export type FlowPlan = {
  id: string
  orgId: string
  planKey: string
  version: number
  enabled: boolean
  digest: string
}

export type FlowAllowedOperations = {
  setPlanEnabled: boolean
  createPlan: boolean
  createRun: boolean
}
export type FlowRunAllowedOperations = { decideApproval: boolean }
export type FlowApprovalDecision = 'approved' | 'rejected'

export type FlowTaskReceipt = {
  taskId: string
  outcome: 'ok' | 'skip' | 'fail' | 'waiting'
  errorCode?: string
  output?: string
  approval?: { by: string; at: string }
}

export type FlowReceiptBundle = {
  receiptVersion: 1
  tokensUsed: number
  tasks: Record<string, FlowTaskReceipt>
}

export type FlowRun = {
  id: string
  orgId: string
  planId: string
  status: string
  receipts: FlowReceiptBundle | null
  errorCode: string | null
}

export type FlowPlansResponse = {
  plans: FlowPlan[]
  allowedOperations: FlowAllowedOperations
  requestId: string
}
export type FlowRunsResponse = { runs: FlowRun[]; requestId: string }
export type FlowPlanResponse = { plan: FlowPlan; requestId: string }
export type FlowRunResponse = {
  run: FlowRun
  allowedOperations: FlowRunAllowedOperations
  requestId: string
}
export type FlowApprovalResponse = {
  runId: string
  taskId: string
  decision: FlowApprovalDecision
  woken: boolean
  requestId: string
}
export type FlowRunAcceptedResponse = {
  run: { id: string; status: 'queued' }
  requestId: string
}

export type TimelineStep = {
  taskId: string
  outcome: FlowTaskReceipt['outcome']
  errorCode?: string
  output?: string
  approval?: { by: string; at: string }
}

/** Path segment only. The API owns minted-id shape. */
export const FLOW_RUN_SEGMENT = /^[A-Za-z0-9_-]+$/

export function isFlowRunId(value: string): boolean {
  return FLOW_RUN_SEGMENT.test(value)
}

export function flowPlansQueryKey(orgId: string) {
  return ['flows', 'plans', orgId] as const
}

export function flowRunsQueryKey(orgId: string) {
  return ['flows', 'runs', orgId] as const
}

export function flowRunQueryKey(orgId: string, runId: string) {
  return ['flows', 'run', orgId, runId] as const
}

function orgHeaders(orgId: string) {
  return { 'X-Org-Id': orgId }
}

/** Receipt record order. A stamp needs both by and at. */
export function timelineFromReceipts(
  receipts: FlowReceiptBundle | null | undefined,
): TimelineStep[] {
  if (!receipts?.tasks) return []
  return Object.values(receipts.tasks).map((task) => {
    const step: TimelineStep = { taskId: task.taskId, outcome: task.outcome }
    if (task.errorCode) step.errorCode = task.errorCode
    if (task.output) step.output = task.output
    if (task.approval?.by && task.approval.at) {
      step.approval = { by: task.approval.by, at: task.approval.at }
    }
    return step
  })
}

export function denialFromError(err: unknown): 'not_found' | 'forbidden' | null {
  if (!(err instanceof HttpError)) return null
  if (err.status === 404) return 'not_found'
  if (err.status === 403) return 'forbidden'
  return null
}

export function fetchFlowPlans(orgId: string) {
  return apiFetch<FlowPlansResponse>('/api/flows/plans', { headers: orgHeaders(orgId) })
}

export function fetchFlowRuns(orgId: string) {
  return apiFetch<FlowRunsResponse>('/api/flows/runs', { headers: orgHeaders(orgId) })
}

export function fetchFlowRun(orgId: string, runId: string) {
  return apiFetch<FlowRunResponse>(`/api/flows/runs/${encodeURIComponent(runId)}`, {
    headers: orgHeaders(orgId),
  })
}

export function patchPlanEnabled(orgId: string, planId: string, enabled: boolean) {
  return apiFetch<FlowPlanResponse>(`/api/flows/plans/${encodeURIComponent(planId)}`, {
    method: 'PATCH',
    headers: orgHeaders(orgId),
    body: JSON.stringify({ enabled }),
  })
}

export function postFlowPlanCheck(orgId: string, yaml: string) {
  return apiFetch<{ ok: true; requestId: string }>('/api/flows/plans/check', {
    method: 'POST',
    headers: orgHeaders(orgId),
    body: JSON.stringify({ yaml }),
  })
}

export function postFlowPlan(orgId: string, yaml: string) {
  return apiFetch<FlowPlanResponse>('/api/flows/plans', {
    method: 'POST',
    headers: orgHeaders(orgId),
    body: JSON.stringify({ yaml }),
  })
}

export function postFlowRun(orgId: string, planId: string) {
  return apiFetch<FlowRunAcceptedResponse>(`/api/flows/plans/${encodeURIComponent(planId)}/runs`, {
    method: 'POST',
    headers: orgHeaders(orgId),
    body: '{}',
  })
}

export function postFlowApproval(
  orgId: string,
  runId: string,
  taskId: string,
  decision: FlowApprovalDecision,
) {
  return apiFetch<FlowApprovalResponse>(
    `/api/flows/runs/${encodeURIComponent(runId)}/tasks/${encodeURIComponent(taskId)}/approval`,
    {
      method: 'POST',
      headers: orgHeaders(orgId),
      body: JSON.stringify({ decision }),
    },
  )
}
