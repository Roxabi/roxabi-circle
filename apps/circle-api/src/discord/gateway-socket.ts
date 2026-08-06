/**
 * Discord Gateway WebSocket protocol helpers (HELLO, IDENTIFY, RESUME, close).
 */

import type { DispatchPayload } from './gateway-handlers'
import {
  applyClose,
  applyHttpAuthFailure,
  applyInvalidSession,
  canResume,
  GATEWAY_SESSION_KEY,
  type GatewaySessionState,
} from './gateway-session'

const GATEWAY_API = 'https://discord.com/api/v10'

// GUILDS (1<<0) | GUILD_VOICE_STATES (1<<7) | GUILD_MESSAGES (1<<9) | MESSAGE_CONTENT (1<<15)
export const GATEWAY_INTENTS = (1 << 0) | (1 << 7) | (1 << 9) | (1 << 15)

type HelloPayload = { heartbeat_interval: number }

export type GatewaySocketCtx = {
  token: string
  getWs: () => WebSocket | null
  getSession: () => GatewaySessionState
  setSession: (s: GatewaySessionState) => void
  saveSession: () => Promise<void>
  loadSession: () => Promise<void>
  storage: DurableObjectStorage
  setWs: (ws: WebSocket | null) => void
  setConnecting: (v: boolean) => void
  onDispatch: (packet: DispatchPayload) => Promise<void>
  identify: () => void
  resume: () => void
}

export function sendIdentify(ws: WebSocket, token: string, intents: number): void {
  console.log('gateway IDENTIFY')
  ws.send(
    JSON.stringify({
      op: 2,
      d: {
        token,
        intents,
        properties: {
          os: 'cloudflare',
          browser: 'roxabi-circle',
          device: 'roxabi-circle',
        },
      },
    }),
  )
}

export function sendResume(ws: WebSocket, token: string, session: GatewaySessionState): boolean {
  if (!canResume(session)) return false
  console.log('gateway RESUME seq=', session.seq)
  ws.send(
    JSON.stringify({
      op: 6,
      d: {
        token,
        session_id: session.sessionId,
        seq: session.seq,
      },
    }),
  )
  return true
}

export async function resolveGatewayUrl(input: {
  token: string
  session: GatewaySessionState
  setSession: (s: GatewaySessionState) => void
  saveSession: () => Promise<void>
  storage: DurableObjectStorage
}): Promise<string | null> {
  if (canResume(input.session) && input.session.resumeUrl) {
    return input.session.resumeUrl
  }

  const res = await fetch(`${GATEWAY_API}/gateway/bot`, {
    headers: {
      Authorization: `Bot ${input.token}`,
      'User-Agent': 'RoxabiCircle (gateway, 0.2)',
    },
  })
  if (res.status === 401 || res.status === 403) {
    input.setSession(applyHttpAuthFailure(input.session, Date.now(), res.status))
    await input.saveSession()
    console.error('gateway/bot auth failure', res.status)
    return null
  }
  if (res.status === 429) {
    let retryMs = 60_000
    try {
      const body = (await res.json()) as { retry_after?: number }
      if (typeof body.retry_after === 'number') {
        retryMs = Math.min(Math.ceil(body.retry_after * 1000) + 500, 900_000)
      }
    } catch {
      /* ignore */
    }
    const next = {
      ...input.session,
      failCount: input.session.failCount + 1,
      nextConnectAt: Date.now() + retryMs,
      lastError: 'gateway_bot_429',
    }
    input.setSession(next)
    await input.saveSession()
    await input.storage.setAlarm(next.nextConnectAt)
    console.warn('gateway/bot 429 backoff_ms', retryMs)
    return null
  }
  if (!res.ok) {
    throw new Error(`gateway/bot ${res.status}`)
  }
  const data = (await res.json()) as { url: string }
  return data.url
}

export async function handleSocketClose(input: {
  code: number
  reason: string
  getSession: () => GatewaySessionState
  setSession: (s: GatewaySessionState) => void
  saveSession: () => Promise<void>
  loadSession: () => Promise<void>
  storage: DurableObjectStorage
  setWs: (ws: WebSocket | null) => void
  setConnecting: (v: boolean) => void
}): Promise<void> {
  console.warn('gateway close', input.code, input.reason)
  input.setWs(null)
  input.setConnecting(false)
  await input.loadSession()
  const result = applyClose({
    session: input.getSession(),
    now: Date.now(),
    code: input.code,
    reason: input.reason,
  })
  input.setSession(result.session)
  await input.saveSession()
  if (result.alarmAt != null) {
    await input.storage.setAlarm(result.alarmAt)
  } else {
    console.error('gateway will not auto-reconnect (hard_stop)', input.code)
  }
}

export async function handleSocketMessage(ctx: GatewaySocketCtx, raw: string): Promise<void> {
  let packet: { op: number; d?: unknown; s?: number | null; t?: string | null }
  try {
    packet = JSON.parse(raw) as typeof packet
  } catch {
    return
  }

  if (packet.s != null) {
    const next = { ...ctx.getSession(), seq: packet.s }
    ctx.setSession(next)
    await ctx.storage.put(GATEWAY_SESSION_KEY, next)
  }

  switch (packet.op) {
    case 10: {
      const hello = packet.d as HelloPayload
      const heartbeatMs = hello.heartbeat_interval > 0 ? hello.heartbeat_interval : 41_250
      ctx.setSession({
        ...ctx.getSession(),
        heartbeatMs,
      })
      await ctx.saveSession()
      const first = heartbeatMs * Math.random()
      await ctx.storage.setAlarm(Date.now() + first)
      if (canResume(ctx.getSession())) {
        ctx.resume()
      } else {
        ctx.identify()
      }
      break
    }
    case 11:
      break
    case 7: {
      try {
        ctx.getWs()?.close(1000, 'discord_reconnect')
      } catch {
        /* ignore */
      }
      ctx.setWs(null)
      ctx.setSession({
        ...ctx.getSession(),
        nextConnectAt: Date.now() + 1_000,
      })
      await ctx.saveSession()
      await ctx.storage.setAlarm(Date.now() + 1_000)
      break
    }
    case 9: {
      const resumable = packet.d === true
      const next = applyInvalidSession(ctx.getSession(), resumable, Date.now())
      ctx.setSession(next)
      await ctx.saveSession()
      const ws = ctx.getWs()
      if (resumable && ws && ws.readyState === WebSocket.OPEN) {
        await new Promise((r) => setTimeout(r, 2_000))
        ctx.resume()
      } else if (ws && ws.readyState === WebSocket.OPEN) {
        await new Promise((r) => setTimeout(r, 2_000))
        ctx.identify()
      } else {
        await ctx.storage.setAlarm(next.nextConnectAt || Date.now() + 2_000)
      }
      break
    }
    case 0:
      await ctx.onDispatch(packet as DispatchPayload)
      break
    default:
      break
  }
}
