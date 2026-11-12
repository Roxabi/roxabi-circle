/**
 * Gateway ensureConnected open-path (URL resolve + WebSocket open).
 */

import { applyClose, clearCircuit, type GatewaySessionState, planConnect } from './gateway-session'
import { resolveGatewayUrl } from './gateway-socket'

const ENCODING = 'json'
const API_VERSION = 10
const CONNECT_DEADLINE_MS = 25_000

function socketBusy(ws: WebSocket | null): boolean {
  if (!ws) return false
  return ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING
}

export type EnsureDeps = {
  envToken: string | undefined
  getSession: () => GatewaySessionState
  setSession: (s: GatewaySessionState) => void
  saveSession: () => Promise<void>
  loadSession: () => Promise<void>
  storage: DurableObjectStorage
  getWs: () => WebSocket | null
  setWs: (ws: WebSocket | null) => void
  getConnecting: () => { connecting: boolean; since: number }
  setConnecting: (v: boolean, since?: number) => void
  force?: boolean
  onMessage: (raw: string) => void
  onClose: (code: number, reason: string) => void
}

function resetStaleConnection(deps: EnsureDeps): void {
  const conn = deps.getConnecting()
  if (conn.connecting && Date.now() - conn.since >= CONNECT_DEADLINE_MS) {
    console.warn('gateway connect deadline — reaping hung connect')
    const ws = deps.getWs()
    if (ws) {
      try {
        ws.close(1000, 'connect_deadline')
      } catch {
        /* ignore */
      }
      deps.setWs(null)
    }
    deps.setConnecting(false)
  }
}

function closeSocket(deps: EnsureDeps, ws: WebSocket, reason: string): void {
  try {
    ws.close(1000, reason)
  } catch {
    /* ignore */
  }
  deps.setWs(null)
}

function finishForcedReconnect(deps: EnsureDeps): void {
  const ws = deps.getWs()
  if (ws) closeSocket(deps, ws, 'force_reconnect')
  deps.setConnecting(false)
}

function replaceNonOpenSocket(deps: EnsureDeps): void {
  const cur = deps.getWs()
  if (cur && cur.readyState !== WebSocket.OPEN) {
    closeSocket(deps, cur, 'replace')
  }
}

function openSocket(deps: EnsureDeps, gatewayUrl: string): void {
  const ws = new WebSocket(`${gatewayUrl}?v=${API_VERSION}&encoding=${ENCODING}`)
  deps.setWs(ws)
  ws.addEventListener('message', (event) => {
    deps.onMessage(String(event.data))
  })
  ws.addEventListener('close', (event) => {
    deps.onClose(event.code, event.reason)
  })
  ws.addEventListener('error', () => {
    console.error('gateway socket error')
  })
  const settle = () => {
    deps.setConnecting(false)
  }
  ws.addEventListener('open', settle)
  ws.addEventListener('close', settle)
}

export async function runEnsureConnected(deps: EnsureDeps): Promise<void> {
  await deps.loadSession()
  resetStaleConnection(deps)

  if (deps.force) {
    deps.setSession(clearCircuit(deps.getSession()))
    await deps.saveSession()
    finishForcedReconnect(deps)
  }

  if (deps.getConnecting().connecting) return

  const gate = planConnect({
    now: Date.now(),
    session: deps.getSession(),
    socketBusy: deps.getConnecting().connecting || socketBusy(deps.getWs()),
    force: deps.force,
  })
  switch (gate.action) {
    case 'skip':
      return
    case 'hard_stop':
      console.error('gateway hard_stop — fix token/intents then POST ensure?force=1', gate.reason)
      return
    case 'wait': {
      const existing = await deps.storage.getAlarm()
      if (existing == null || existing > gate.until) {
        await deps.storage.setAlarm(gate.until)
      }
      return
    }
  }
  if (!deps.envToken) {
    console.error('gateway: missing DISCORD_BOT_TOKEN')
    return
  }

  replaceNonOpenSocket(deps)

  deps.setConnecting(true, Date.now())
  try {
    const gatewayUrl = await resolveGatewayUrl({
      token: deps.envToken,
      session: deps.getSession(),
      setSession: deps.setSession,
      saveSession: deps.saveSession,
      storage: deps.storage,
    })
    if (!gatewayUrl) {
      deps.setConnecting(false)
      return
    }

    openSocket(deps, gatewayUrl)
    await deps.storage.setAlarm(Date.now() + CONNECT_DEADLINE_MS)
  } catch (e) {
    deps.setConnecting(false)
    deps.setWs(null)
    const msg = e instanceof Error ? e.message : String(e)
    console.error('gateway ensure failed', msg)
    const closed = applyClose({
      session: deps.getSession(),
      now: Date.now(),
      code: 1006,
      reason: msg.slice(0, 200),
    })
    deps.setSession(closed.session)
    await deps.saveSession()
    if (closed.alarmAt != null) await deps.storage.setAlarm(closed.alarmAt)
  }
}
