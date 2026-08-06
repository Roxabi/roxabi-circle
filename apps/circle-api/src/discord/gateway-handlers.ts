/**
 * Discord Gateway dispatch handlers (READY, voice, github-watch).
 * Kept out of gateway.ts for the 300-line file-length gate.
 */

import type { Env } from '../types'
import { applyReady, applyResumed, type GatewaySessionState } from './gateway-session'
import { enforceGithubWatch, type GatewayMessage, planGithubWatchMessage } from './github-watch'
import {
  emptyTempVoiceStore,
  hydrateOccupancyFromVoiceStates,
  type TempVoiceStore,
  type VoiceStateUpdate,
} from './temp-voice'
import { cleanupEmptyTempVoices, handleTempVoiceUpdate } from './temp-voice-rest'

const STORE_KEY = 'temp_voice_v1'

export type DispatchPayload = { t?: string; s?: number | null; d?: unknown }

export type GatewayDispatchCtx = {
  env: Env
  storage: DurableObjectStorage
  getBotUserId: () => string | null
  setBotUserId: (id: string | null) => void
  getSession: () => GatewaySessionState
  setSession: (s: GatewaySessionState) => void
  saveSession: () => Promise<void>
  enqueueVoice: (fn: () => Promise<void>) => Promise<void>
}

export async function loadTempVoiceStore(storage: DurableObjectStorage): Promise<TempVoiceStore> {
  const raw = await storage.get<TempVoiceStore>(STORE_KEY)
  if (!raw || typeof raw !== 'object') return emptyTempVoiceStore()
  return {
    channels: raw.channels ?? {},
    occupancy: raw.occupancy ?? {},
    creating: raw.creating ?? {},
  }
}

export async function saveTempVoiceStore(
  storage: DurableObjectStorage,
  store: TempVoiceStore,
): Promise<void> {
  await storage.put(STORE_KEY, store)
}

export async function handleGatewayDispatch(
  ctx: GatewayDispatchCtx,
  packet: DispatchPayload,
): Promise<void> {
  const t = packet.t
  if (t === 'READY') {
    const d = packet.d as {
      user?: { id?: string }
      session_id?: string
      resume_gateway_url?: string
    }
    ctx.setBotUserId(d.user?.id ?? null)
    if (d.session_id) {
      const session = ctx.getSession()
      ctx.setSession(
        applyReady({
          session,
          now: Date.now(),
          sessionId: d.session_id,
          resumeUrl: d.resume_gateway_url ?? null,
          seq: session.seq,
        }),
      )
      await ctx.saveSession()
    }
    console.log('gateway READY bot=', ctx.getBotUserId())
    return
  }

  if (t === 'RESUMED') {
    const session = ctx.getSession()
    ctx.setSession(
      applyResumed({
        session,
        now: Date.now(),
        seq: session.seq,
      }),
    )
    await ctx.saveSession()
    console.log('gateway RESUMED')
    return
  }

  if (t === 'GUILD_CREATE') {
    await onGuildCreate(ctx, packet.d)
    return
  }

  if (t === 'VOICE_STATE_UPDATE') {
    await ctx.enqueueVoice(() => onVoiceStateUpdate(ctx, packet.d as VoiceStateUpdate))
    return
  }

  if (t !== 'MESSAGE_CREATE') return
  await onGithubWatchMessage(ctx, packet.d as GatewayMessage)
}

async function onGuildCreate(ctx: GatewayDispatchCtx, d: unknown): Promise<void> {
  const guild = d as {
    id?: string
    voice_states?: Array<{ channel_id?: string | null; user_id?: string }>
  }
  if (!guild.id || guild.id !== ctx.env.DISCORD_GUILD_ID) return
  if (!ctx.env.DISCORD_VOICE_HUB_CHANNEL_ID) return

  let store = await loadTempVoiceStore(ctx.storage)
  store = hydrateOccupancyFromVoiceStates(store, guild.voice_states ?? [])
  const cleaned = await cleanupEmptyTempVoices({
    token: ctx.env.DISCORD_BOT_TOKEN,
    store,
  })
  await saveTempVoiceStore(ctx.storage, cleaned.store)
  if (cleaned.deleted.length) {
    console.log('temp-voice stale cleanup', cleaned.deleted)
  }
}

async function onVoiceStateUpdate(ctx: GatewayDispatchCtx, vs: VoiceStateUpdate): Promise<void> {
  const hub = ctx.env.DISCORD_VOICE_HUB_CHANNEL_ID
  const category = ctx.env.DISCORD_VOICE_CATEGORY_ID
  const guildId = ctx.env.DISCORD_GUILD_ID
  const memberRoleId = ctx.env.DISCORD_MEMBER_ROLE_ID
  if (!hub || !category || !guildId || !memberRoleId) return
  if (vs.guild_id && vs.guild_id !== guildId) return

  const store = await loadTempVoiceStore(ctx.storage)
  try {
    const result = await handleTempVoiceUpdate({
      token: ctx.env.DISCORD_BOT_TOKEN,
      guildId,
      hubChannelId: hub,
      categoryId: category,
      memberRoleId,
      botUserId: ctx.getBotUserId() ?? undefined,
      store,
      vs,
    })
    await saveTempVoiceStore(ctx.storage, result.store)
    if (!result.done.startsWith('ignore:')) {
      console.log('temp-voice', result.done, 'user', vs.user_id)
    }
  } catch (e) {
    console.error('temp-voice failed', e)
  }
}

async function onGithubWatchMessage(ctx: GatewayDispatchCtx, msg: GatewayMessage): Promise<void> {
  const watchId = ctx.env.DISCORD_GITHUB_WATCH_CHANNEL_ID
  if (!watchId) return

  const action = planGithubWatchMessage(msg, watchId, ctx.getBotUserId() ?? undefined)
  if (action.type === 'ignore') return

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

  try {
    const result = await enforceGithubWatch({
      token: ctx.env.DISCORD_BOT_TOKEN,
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
