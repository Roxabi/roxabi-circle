/**
 * Discord Gateway DO — outgoing WS.
 * MESSAGE_CREATE → github-watch · VOICE_STATE → temp voice.
 * Session hygiene: persist + RESUME preferred, backoff, hard-stop (≈1000 IDENTIFY/day).
 * Outbound WS keeps DO ≤15m; alarms + storage recover after eviction.
 * Intents: Message Content (priv) + Guild Voice States + GUILDS.
 */

import { DurableObject } from 'cloudflare:workers'
import type { Env } from '../types'
import {
  type GatewayDispatchCtx,
  handleGatewayDispatch,
  loadTempVoiceStore,
} from './gateway-handlers'
import {
  applyClose,
  clearCircuit,
  emptyGatewaySession,
  GATEWAY_SESSION_KEY,
  type GatewaySessionState,
  hydrateGatewaySession,
  planConnect,
} from './gateway-session'
import {
  GATEWAY_INTENTS,
  handleSocketClose,
  handleSocketMessage,
  resolveGatewayUrl,
  sendIdentify,
  sendResume,
} from './gateway-socket'

const ENCODING = 'json'
const API_VERSION = 10

function socketBusy(ws: WebSocket | null): boolean {
  if (!ws) return false
  return ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING
}

export class DiscordGateway extends DurableObject<Env> {
  private ws: WebSocket | null = null
  private connecting = false
  private voiceChain: Promise<void> = Promise.resolve()
  private session: GatewaySessionState = emptyGatewaySession()
  private botUserId: string | null = null

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/status') {
      await this.loadSession()
      const store = await loadTempVoiceStore(this.ctx.storage)
      return Response.json({
        connected: this.ws !== null && this.ws.readyState === WebSocket.OPEN,
        connecting: this.connecting || this.ws?.readyState === WebSocket.CONNECTING,
        seq: this.session.seq,
        botUserId: this.botUserId,
        sessionId: this.session.sessionId,
        hardStop: this.session.hardStop,
        failCount: this.session.failCount,
        nextConnectAt: this.session.nextConnectAt,
        lastCloseCode: this.session.lastCloseCode,
        lastError: this.session.lastError,
        lastReadyAt: this.session.lastReadyAt,
        tempVoiceRooms: Object.keys(store.channels).length,
        tempVoice: store.channels,
      })
    }
    if (url.pathname === '/connect' || url.pathname === '/ensure') {
      const force =
        url.searchParams.get('force') === '1' ||
        url.searchParams.get('force') === 'true' ||
        request.headers.get('X-Gateway-Force') === '1'
      await this.ensureConnected({ force })
      return Response.json({
        ok: true,
        connected: this.ws !== null && this.ws.readyState === WebSocket.OPEN,
        hardStop: this.session.hardStop,
        failCount: this.session.failCount,
        sessionId: this.session.sessionId,
      })
    }
    return new Response('DiscordGateway: /status | /connect|/ensure?force=1', { status: 404 })
  }

  async alarm(): Promise<void> {
    await this.loadSession()
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ op: 1, d: this.session.seq }))
      } catch {
        this.ws = null
        await this.ensureConnected({ force: false })
        return
      }
      await this.ctx.storage.setAlarm(Date.now() + this.session.heartbeatMs)
      return
    }
    await this.ensureConnected({ force: false })
  }

  private async loadSession(): Promise<void> {
    this.session = hydrateGatewaySession(await this.ctx.storage.get(GATEWAY_SESSION_KEY))
  }

  private async saveSession(): Promise<void> {
    await this.ctx.storage.put(GATEWAY_SESSION_KEY, this.session)
  }

  private sessionAccess() {
    return {
      getSession: () => this.session,
      setSession: (s: GatewaySessionState) => {
        this.session = s
      },
      saveSession: () => this.saveSession(),
      loadSession: () => this.loadSession(),
      storage: this.ctx.storage,
      setWs: (ws: WebSocket | null) => {
        this.ws = ws
      },
      setConnecting: (v: boolean) => {
        this.connecting = v
      },
    }
  }

  private async ensureConnected(opts: { force?: boolean }): Promise<void> {
    await this.loadSession()

    if (opts.force) {
      this.session = clearCircuit(this.session)
      await this.saveSession()
      if (this.ws) {
        try {
          this.ws.close(1000, 'force_reconnect')
        } catch {
          /* ignore */
        }
        this.ws = null
      }
      this.connecting = false
    }

    if (this.connecting) return

    const gate = planConnect({
      now: Date.now(),
      session: this.session,
      socketBusy: this.connecting || socketBusy(this.ws),
      force: opts.force,
    })
    if (gate.action === 'skip') return
    if (gate.action === 'hard_stop') {
      console.error('gateway hard_stop — fix token/intents then POST ensure?force=1', gate.reason)
      return
    }
    if (gate.action === 'wait') {
      const existing = await this.ctx.storage.getAlarm()
      if (existing == null || existing > gate.until) {
        await this.ctx.storage.setAlarm(gate.until)
      }
      return
    }
    if (!this.env.DISCORD_BOT_TOKEN) {
      console.error('gateway: missing DISCORD_BOT_TOKEN')
      return
    }

    if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
      try {
        this.ws.close(1000, 'replace')
      } catch {
        /* ignore */
      }
      this.ws = null
    }

    this.connecting = true
    try {
      const gatewayUrl = await resolveGatewayUrl({
        token: this.env.DISCORD_BOT_TOKEN,
        session: this.session,
        setSession: (s) => {
          this.session = s
        },
        saveSession: () => this.saveSession(),
        storage: this.ctx.storage,
      })
      if (!gatewayUrl) {
        this.connecting = false
        return
      }

      const ws = new WebSocket(`${gatewayUrl}?v=${API_VERSION}&encoding=${ENCODING}`)
      this.ws = ws
      ws.addEventListener('message', (event) => {
        void this.onSocketMessage(String(event.data))
      })
      ws.addEventListener('close', (event) => {
        void this.onSocketClose(event.code, event.reason)
      })
      ws.addEventListener('error', () => {
        console.error('gateway socket error')
      })
      const settle = () => {
        this.connecting = false
      }
      ws.addEventListener('open', settle)
      ws.addEventListener('close', settle)
    } catch (e) {
      this.connecting = false
      this.ws = null
      const msg = e instanceof Error ? e.message : String(e)
      console.error('gateway ensure failed', msg)
      const closed = applyClose({
        session: this.session,
        now: Date.now(),
        code: 1006,
        reason: msg.slice(0, 200),
      })
      this.session = closed.session
      await this.saveSession()
      if (closed.alarmAt != null) await this.ctx.storage.setAlarm(closed.alarmAt)
    }
  }

  private async onSocketClose(code: number, reason: string): Promise<void> {
    await handleSocketClose({ code, reason, ...this.sessionAccess() })
  }

  private async onSocketMessage(raw: string): Promise<void> {
    await handleSocketMessage(
      {
        token: this.env.DISCORD_BOT_TOKEN,
        getWs: () => this.ws,
        onDispatch: (packet) => this.onDispatch(packet),
        identify: () => this.identify(),
        resume: () => this.resume(),
        ...this.sessionAccess(),
      },
      raw,
    )
  }

  private identify(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    sendIdentify(this.ws, this.env.DISCORD_BOT_TOKEN, GATEWAY_INTENTS)
  }

  private resume(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    if (!sendResume(this.ws, this.env.DISCORD_BOT_TOKEN, this.session)) this.identify()
  }

  private dispatchCtx(): GatewayDispatchCtx {
    return {
      env: this.env,
      storage: this.ctx.storage,
      getBotUserId: () => this.botUserId,
      setBotUserId: (id) => {
        this.botUserId = id
      },
      getSession: () => this.session,
      setSession: (s) => {
        this.session = s
      },
      saveSession: () => this.saveSession(),
      enqueueVoice: async (fn) => {
        this.voiceChain = this.voiceChain
          .then(fn)
          .catch((e) => console.error('temp-voice chain', e))
        await this.voiceChain
      },
    }
  }

  private async onDispatch(packet: { t?: string; s?: number | null; d?: unknown }): Promise<void> {
    await handleGatewayDispatch(this.dispatchCtx(), packet)
  }
}
