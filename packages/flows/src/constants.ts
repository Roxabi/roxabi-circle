/** Kit module id — ADR-0003 catalogue + ADR-0005. */
export const FLOWS_MODULE_ID = 'flows' as const

/** Plan language family (not Nika-spec). */
export const FLOWS_VERSION = 'v0' as const

/** Max YAML document size (bytes) before parse. */
export const MAX_PLAN_YAML_BYTES = 64 * 1024

/** Max tasks per plan. */
export const MAX_PLAN_TASKS = 32

/** Max tool names listed in permits. */
export const MAX_PERMIT_TOOLS = 64

/** Max total declared max_tokens across infer tasks. */
export const MAX_PLAN_TOTAL_TOKENS = 100_000

/** Max model ids minted into a grant (ADR-0005 D2). */
export const MAX_ALLOWED_MODELS = 32

/** Max length of one model id. */
export const MAX_MODEL_ID_CHARS = 256

/**
 * Default per-infer max_tokens when task omits max_tokens but plan.max_tokens is set
 * (plan.max_tokens is required whenever any task uses infer — see schema).
 */
export const DEFAULT_INFER_MAX_TOKENS = 4096 as const

/** Default HITL approve wait when the task omits timeout_hours. */
export const DEFAULT_APPROVE_TIMEOUT_HOURS = 24 as const

/** Org roles allowed to admin flows in V0. */
export const FLOWS_ADMIN_ROLES = ['owner', 'admin'] as const

export type FlowsAdminRole = (typeof FLOWS_ADMIN_ROLES)[number]
