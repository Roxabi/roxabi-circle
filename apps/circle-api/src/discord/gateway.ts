/**
 * Discord Gateway DO — outgoing WS.
 * MESSAGE_CREATE → github-watch / news-actu / daily-digest / @Lyra webhook · VOICE_STATE → temp voice.
 * Session hygiene: persist + RESUME, backoff, hard-stop (≈1000 IDENTIFY/day).
 */

import { DurableObject } from 'cloudflare:workers'
import type { Env } from '../types'
import { isVoiceRecordSpikeArmed } from '../voice-record/flag'
import { buildVoiceStateUpdateOp, sendVoiceStateUpdate } from '../voice-record/gateway-voice'
import { handoffPublicView, handoffReady } from '../voice-record/handoff'
import { loadVoiceHandoff } from '../voice-record/persist-handoff'
import { runEnsureConnected } from './gateway-connect'
import {
  type GatewayDispatchCtx,
  handleGatewayDispatch,
  loadTempVoiceStore,
  reconcileTempVoiceAfterResume,
} from './gateway-handlers'
import {
  emptyGatewaySession,
  GATEWAY_SESSION_KEY,
  type GatewaySessionState,
  hydrateGatewaySession,
} from './gateway-session'
import {
  GATEWAY_INTENTS,
  handleSocketClose,
  handleSocketMessage,
  sendIdentify,
  sendResume,
} from './gateway-socket'

export class DiscordGateway extends DurableObject<Env> {
  private ws: WebSocket | null = null
  private connecting = false
  private connectingSince = 0
  private voiceChain: Promise<void> = Promise.resolve()
  private gatewayChain: Promise<void> = Promise.resolve()
  private session: GatewaySessionState = emptyGatewaySession()

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/status') {
      await this.loadSession()
      const store = await loadTempVoiceStore(this.ctx.storage)
      return Response.json({
        connected: this.ws !== null && this.ws.readyState === WebSocket.OPEN,
        connecting: this.connecting || this.ws?.readyState === WebSocket.CONNECTING,
        seq: this.session.seq,
        botUserId: this.session.botUserId,
        sessionId: this.session.sessionId,
        hardStop: this.session.hardStop,
        failCount: this.session.failCount,
        nextConnectAt: this.session.nextConnectAt,
        lastCloseCode: this.session.lastCloseCode,
        lastError: this.session.lastError,
        lastReadyAt: this.session.lastReadyAt,
        tempVoiceRooms: Object.keys(store.channels).length,
        occupancyTrusted: store.occupancyTrusted !== false,
        tempVoice: store.channels,
      })
    }
    if (url.pathname === '/voice-handoff') {
      const h = await loadVoiceHandoff(this.ctx.storage)
      const publicOnly = url.searchParams.get('public') === '1'
      return Response.json({
        ok: true,
        ready: handoffReady(h),
        handoff: publicOnly ? handoffPublicView(h) : h,
      })
    }
    if (url.pathname === '/voice-state' && request.method === 'POST') {
      if (!isVoiceRecordSpikeArmed(this.env)) {
        return Response.json({ ok: false, error: 'spike_not_armed' }, { status: 404 })
      }
      let body: { guildId?: string; channelId?: string | null } = {}
      try {
        body = (await request.json()) as typeof body
      } catch {
        return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 })
      }
      if (!body.guildId) {
        return Response.json({ ok: false, error: 'invalid_guild_id' }, { status: 400 })
      }
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return Response.json({ ok: false, error: 'gateway_not_connected' }, { status: 503 })
      }
      sendVoiceStateUpdate(
        this.ws,
        buildVoiceStateUpdateOp({
          guildId: body.guildId,
          channelId: body.channelId ?? null,
        }),
      )
      return Response.json({ ok: true, sent: true })
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
    return new Response(
      'DiscordGateway: /status | /connect|/ensure?force=1 | /voice-state | /voice-handoff',
      { status: 404 },
    )
  }

  async alarm(): Promise<void> {
    await this.loadSession()
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        await reconcileTempVoiceAfterResume({
          token: this.env.DISCORD_BOT_TOKEN,
          storage: this.ctx.storage,
        })
      } catch (e) {
        console.error('temp-voice resume reconcile', e)
      }
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
      loadSession: async () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return
        await this.loadSession()
      },
      storage: this.ctx.storage,
      setWs: (ws: WebSocket | null) => {
        this.ws = ws
      },
      setConnecting: (v: boolean) => {
        this.connecting = v
        this.connectingSince = v ? Date.now() : 0
      },
    }
  }

  private enqueueGateway(fn: () => Promise<void>): Promise<void> {
    this.gatewayChain = this.gatewayChain.then(fn).catch((e) => console.error('gateway chain', e))
    return this.gatewayChain
  }

  private async ensureConnected(opts: { force?: boolean }): Promise<void> {
    await runEnsureConnected({
      envToken: this.env.DISCORD_BOT_TOKEN,
      getSession: () => this.session,
      setSession: (s) => {
        this.session = s
      },
      saveSession: () => this.saveSession(),
      loadSession: () => this.loadSession(),
      storage: this.ctx.storage,
      getWs: () => this.ws,
      setWs: (ws) => {
        this.ws = ws
      },
      getConnecting: () => ({ connecting: this.connecting, since: this.connectingSince }),
      setConnecting: (v, since) => {
        this.connecting = v
        this.connectingSince = v ? (since ?? Date.now()) : 0
      },
      force: opts.force,
      onMessage: (raw) => {
        void this.enqueueGateway(() => this.onSocketMessage(raw))
      },
      onClose: (code, reason) => {
        void this.enqueueGateway(() => this.onSocketClose(code, reason))
      },
    })
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
      getBotUserId: () => this.session.botUserId,
      setBotUserId: (id) => {
        this.session = { ...this.session, botUserId: id }
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
      waitUntil: (p) => this.ctx.waitUntil(p),
      sleep: (ms) => new Promise<void>((r) => setTimeout(r, ms)),
    }
  }

  private async onDispatch(packet: { t?: string; s?: number | null; d?: unknown }): Promise<void> {
    await handleGatewayDispatch(this.dispatchCtx(), packet)
  }
}
