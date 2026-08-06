/**
 * Pure Gateway session / reconnect policy (unit-tested).
 * Keeps Discord session-start rate under control (IDENTIFY ≈ 1000/day hard limit).
 */

export const GATEWAY_SESSION_KEY = 'gateway_session_v1'

/** Close codes that must never auto-reconnect (auth / config). */
export const HARD_STOP_CLOSE_CODES = new Set([
  4004, // Authentication failed
  4010, // Invalid shard
  4011, // Sharding required
  4013, // Invalid intent(s)
  4014, // Disallowed intent(s)
])

export type GatewaySessionState = {
  sessionId: string | null
  resumeUrl: string | null
  seq: number | null
  heartbeatMs: number
  /** Consecutive connect failures (reset on READY/RESUMED). */
  failCount: number
  /** Do not open a new socket before this epoch ms. */
  nextConnectAt: number
  /** Auth/config failure — wait for ops force ensure. */
  hardStop: boolean
  lastCloseCode: number | null
  lastError: string | null
  /** Last successful READY/RESUMED epoch ms. */
  lastReadyAt: number | null
  /** Bot user id from READY — persisted so RESUME after eviction still self-filters. */
  botUserId: string | null
}

export function emptyGatewaySession(): GatewaySessionState {
  return {
    sessionId: null,
    resumeUrl: null,
    seq: null,
    heartbeatMs: 41_250,
    failCount: 0,
    nextConnectAt: 0,
    hardStop: false,
    lastCloseCode: null,
    lastError: null,
    lastReadyAt: null,
    botUserId: null,
  }
}

export function hydrateGatewaySession(raw: unknown): GatewaySessionState {
  const base = emptyGatewaySession()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Partial<GatewaySessionState>
  return {
    sessionId: typeof o.sessionId === 'string' ? o.sessionId : null,
    resumeUrl: typeof o.resumeUrl === 'string' ? o.resumeUrl : null,
    seq: typeof o.seq === 'number' ? o.seq : null,
    heartbeatMs: typeof o.heartbeatMs === 'number' && o.heartbeatMs > 0 ? o.heartbeatMs : 41_250,
    failCount: typeof o.failCount === 'number' && o.failCount >= 0 ? o.failCount : 0,
    nextConnectAt: typeof o.nextConnectAt === 'number' ? o.nextConnectAt : 0,
    hardStop: o.hardStop === true,
    lastCloseCode: typeof o.lastCloseCode === 'number' ? o.lastCloseCode : null,
    lastError: typeof o.lastError === 'string' ? o.lastError : null,
    lastReadyAt: typeof o.lastReadyAt === 'number' ? o.lastReadyAt : null,
    botUserId: typeof o.botUserId === 'string' ? o.botUserId : null,
  }
}

/** Exponential backoff: 5s → 15s → 30s → 60s → 2m → 5m → 15m (cap). */
export function backoffMs(failCount: number): number {
  const steps = [5_000, 15_000, 30_000, 60_000, 120_000, 300_000, 900_000]
  const i = Math.min(Math.max(failCount, 0), steps.length - 1)
  return steps[i]!
}

export function canResume(session: GatewaySessionState): boolean {
  return Boolean(session.sessionId && session.seq != null)
}

export type ConnectGate =
  | { action: 'connect'; reason: string }
  | { action: 'wait'; until: number; reason: string }
  | { action: 'hard_stop'; reason: string }
  | { action: 'skip'; reason: string }

/**
 * Whether we may open a new Gateway WebSocket now.
 * `socketBusy` = already OPEN or CONNECTING (or hibernatable server sockets — N/A for outbound).
 */
export function planConnect(input: {
  now: number
  session: GatewaySessionState
  socketBusy: boolean
  force?: boolean
}): ConnectGate {
  if (input.socketBusy) {
    return { action: 'skip', reason: 'socket_busy' }
  }
  if (input.force) {
    return { action: 'connect', reason: 'force' }
  }
  if (input.session.hardStop) {
    return {
      action: 'hard_stop',
      reason: input.session.lastError ?? 'hard_stop',
    }
  }
  if (input.now < input.session.nextConnectAt) {
    return {
      action: 'wait',
      until: input.session.nextConnectAt,
      reason: 'backoff',
    }
  }
  return { action: 'connect', reason: 'ok' }
}

export type AfterCloseResult = {
  session: GatewaySessionState
  /** When to fire reconnect alarm (null = do not schedule). */
  alarmAt: number | null
}

export function applyClose(input: {
  session: GatewaySessionState
  now: number
  code: number
  reason?: string
}): AfterCloseResult {
  const session: GatewaySessionState = {
    ...input.session,
    lastCloseCode: input.code,
    lastError: input.reason?.slice(0, 200) || `close_${input.code}`,
  }

  if (HARD_STOP_CLOSE_CODES.has(input.code)) {
    session.hardStop = true
    session.failCount = input.session.failCount + 1
    session.nextConnectAt = input.now + 86_400_000 // 24h; ops force clears
    // Drop resume material on auth failure
    session.sessionId = null
    session.resumeUrl = null
    session.seq = null
    return { session, alarmAt: null }
  }

  // Invalid seq / session timeout → clear resume fields so next attempt IDENTIFYs cleanly
  if (input.code === 4007 || input.code === 4009) {
    session.sessionId = null
    session.resumeUrl = null
    session.seq = null
  }

  session.failCount = input.session.failCount + 1
  const delay = backoffMs(session.failCount - 1)
  session.nextConnectAt = input.now + delay
  return { session, alarmAt: session.nextConnectAt }
}

export function applyReady(input: {
  session: GatewaySessionState
  now: number
  sessionId: string
  resumeUrl?: string | null
  seq: number | null
  botUserId?: string | null
}): GatewaySessionState {
  return {
    ...input.session,
    sessionId: input.sessionId,
    resumeUrl: input.resumeUrl ?? input.session.resumeUrl,
    seq: input.seq,
    failCount: 0,
    nextConnectAt: 0,
    hardStop: false,
    lastCloseCode: null,
    lastError: null,
    lastReadyAt: input.now,
    botUserId: input.botUserId ?? input.session.botUserId,
  }
}

export function applyResumed(input: {
  session: GatewaySessionState
  now: number
  seq: number | null
}): GatewaySessionState {
  return {
    ...input.session,
    seq: input.seq ?? input.session.seq,
    failCount: 0,
    nextConnectAt: 0,
    hardStop: false,
    lastCloseCode: null,
    lastError: null,
    lastReadyAt: input.now,
  }
}

/** INVALID_SESSION (op 9): d === false → full re-identify; d === true → may retry resume. */
export function applyInvalidSession(
  session: GatewaySessionState,
  resumable: boolean,
  now: number,
): GatewaySessionState {
  if (resumable) {
    return {
      ...session,
      nextConnectAt: now + 2_000,
    }
  }
  return {
    ...session,
    sessionId: null,
    resumeUrl: null,
    seq: null,
    failCount: session.failCount + 1,
    nextConnectAt: now + Math.max(2_000, backoffMs(session.failCount)),
  }
}

export function clearCircuit(session: GatewaySessionState): GatewaySessionState {
  return {
    ...session,
    hardStop: false,
    failCount: 0,
    nextConnectAt: 0,
    lastError: null,
    lastCloseCode: null,
  }
}

export function applyHttpAuthFailure(
  session: GatewaySessionState,
  now: number,
  status: number,
): GatewaySessionState {
  return {
    ...session,
    hardStop: true,
    failCount: session.failCount + 1,
    nextConnectAt: now + 86_400_000,
    lastError: `gateway_bot_http_${status}`,
    sessionId: null,
    resumeUrl: null,
    seq: null,
  }
}
