/**
 * Discord Gateway client as a Durable Object (outgoing WebSocket).
 * Receives MESSAGE_CREATE and enforces #github-to-watch rules.
 *
 * Requires privileged intents in Developer Portal:
 * - Message Content Intent
 * - (optional) Server Members Intent — not required for this handler
 */

import { DurableObject } from 'cloudflare:workers'
import type { Env } from '../types'
import { enforceGithubWatch, type GatewayMessage, planGithubWatchMessage } from './github-watch'

const GATEWAY_API = 'https://discord.com/api/v10'
const ENCODING = 'json'
const API_VERSION = 10

// Intents: GUILD_MESSAGES (1<<9) | MESSAGE_CONTENT (1<<15)
const INTENTS = (1 << 9) | (1 << 15)

type HelloPayload = { heartbeat_interval: number }
type DispatchPayload = { t?: string; s?: number | null; d?: unknown }

export class DiscordGateway extends DurableObject<Env> {
  private ws: WebSocket | null = null
  private seq: number | null = null
  private heartbeatMs = 41250
  private botUserId: string | null = null
  private sessionId: string | null = null
  private resumeUrl: string | null = null
  private connecting = false

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/status') {
      return Response.json({
        connected: this.ws !== null && this.ws.readyState === WebSocket.OPEN,
        seq: this.seq,
        botUserId: this.botUserId,
        sessionId: this.sessionId,
      })
    }
    if (url.pathname === '/connect' || url.pathname === '/ensure') {
      await this.ensureConnected()
      return Response.json({
        ok: true,
        connected: this.ws !== null && this.ws.readyState === WebSocket.OPEN,
      })
    }
    return new Response('DiscordGateway: /status | /connect', { status: 404 })
  }

  async alarm(): Promise<void> {
    // Heartbeat or reconnect
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ op: 1, d: this.seq }))
      } catch {
        this.ws = null
        await this.ensureConnected()
        return
      }
      // schedule next heartbeat
      await this.ctx.storage.setAlarm(Date.now() + this.heartbeatMs)
      return
    }
    await this.ensureConnected()
  }

  private async ensureConnected(): Promise<void> {
    if (this.connecting) return
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return
    if (!this.env.DISCORD_BOT_TOKEN) {
      console.error('gateway: missing DISCORD_BOT_TOKEN')
      return
    }

    this.connecting = true
    try {
      const gatewayUrl = await this.getGatewayUrl()
      const ws = new WebSocket(`${gatewayUrl}?v=${API_VERSION}&encoding=${ENCODING}`)
      this.ws = ws

      ws.addEventListener('message', (event) => {
        void this.onSocketMessage(String(event.data))
      })
      ws.addEventListener('close', (event) => {
        console.warn('gateway close', event.code, event.reason)
        this.ws = null
        // reconnect shortly
        void this.ctx.storage.setAlarm(Date.now() + 5_000)
      })
      ws.addEventListener('error', () => {
        console.error('gateway socket error')
      })
    } finally {
      this.connecting = false
    }
  }

  private async getGatewayUrl(): Promise<string> {
    if (this.resumeUrl) return this.resumeUrl
    const res = await fetch(`${GATEWAY_API}/gateway/bot`, {
      headers: {
        Authorization: `Bot ${this.env.DISCORD_BOT_TOKEN}`,
        'User-Agent': 'RoxabiCircle (gateway, 0.1)',
      },
    })
    if (!res.ok) {
      throw new Error(`gateway/bot ${res.status}`)
    }
    const data = (await res.json()) as { url: string }
    return data.url
  }

  private async onSocketMessage(raw: string): Promise<void> {
    let packet: { op: number; d?: unknown; s?: number | null; t?: string | null }
    try {
      packet = JSON.parse(raw) as typeof packet
    } catch {
      return
    }

    if (packet.s != null) this.seq = packet.s

    switch (packet.op) {
      case 10: {
        // HELLO
        const hello = packet.d as HelloPayload
        this.heartbeatMs = hello.heartbeat_interval
        // jitter first heartbeat
        const first = this.heartbeatMs * Math.random()
        await this.ctx.storage.setAlarm(Date.now() + first)
        this.identify()
        break
      }
      case 11:
        // HEARTBEAT_ACK
        break
      case 7:
        // RECONNECT
        this.ws?.close()
        this.ws = null
        await this.ensureConnected()
        break
      case 9:
        // INVALID_SESSION
        this.sessionId = null
        this.resumeUrl = null
        await new Promise((r) => setTimeout(r, 2000))
        this.identify()
        break
      case 0:
        await this.onDispatch(packet as DispatchPayload)
        break
      default:
        break
    }
  }

  private identify(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(
      JSON.stringify({
        op: 2,
        d: {
          token: this.env.DISCORD_BOT_TOKEN,
          intents: INTENTS,
          properties: {
            os: 'cloudflare',
            browser: 'roxabi-circle',
            device: 'roxabi-circle',
          },
        },
      }),
    )
  }

  private async onDispatch(packet: DispatchPayload): Promise<void> {
    const t = packet.t
    if (t === 'READY') {
      const d = packet.d as {
        user?: { id?: string }
        session_id?: string
        resume_gateway_url?: string
      }
      this.botUserId = d.user?.id ?? null
      this.sessionId = d.session_id ?? null
      this.resumeUrl = d.resume_gateway_url ?? null
      console.log('gateway READY bot=', this.botUserId)
      return
    }

    if (t !== 'MESSAGE_CREATE') return

    const msg = packet.d as GatewayMessage
    const watchId = this.env.DISCORD_GITHUB_WATCH_CHANNEL_ID
    if (!watchId) return

    const action = planGithubWatchMessage(msg, watchId, this.botUserId ?? undefined)
    if (action.type === 'ignore') return

    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

    try {
      const result = await enforceGithubWatch({
        token: this.env.DISCORD_BOT_TOKEN,
        msg,
        action,
        noticeTtlMs: action.type === 'reject' ? 12_000 : undefined,
        sleep: action.type === 'reject' ? sleep : undefined,
      })
      console.log('github-watch', result.done, 'msg', msg.id)
    } catch (e) {
      console.error('github-watch enforce failed', e)
    }
  }
}
