/**
 * Discord Gateway dispatch handlers (READY, voice, links channels).
 * Kept out of gateway.ts for the 300-line file-length gate.
 */

import type { Env } from '../types'
import { type DailyDigestAction, enforceDailyDigest, planDailyDigestMessage } from './daily-digest'
import { applyReady, applyResumed, type GatewaySessionState } from './gateway-session'
import {
  enforceGithubWatch,
  type GatewayMessage,
  type GithubWatchAction,
  planGithubWatchMessage,
} from './github-watch'
import { rememberGuildPrivilege, scheduleLyraMentionForward } from './lyra-mention'
import { enforceNewsActu, type NewsActuAction, planNewsActuMessage } from './news-actu'
import {
  emptyTempVoiceStore,
  hydrateOccupancyFromVoiceStates,
  markOccupancyTrusted,
  markOccupancyUntrusted,
  shouldReconcileAfterResume,
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
  /** DO waitUntil — used for fire-and-forget @Lyra webhook POST. */
  waitUntil?: (promise: Promise<unknown>) => void
  sleep?: (ms: number) => Promise<void>
}

export async function loadTempVoiceStore(storage: DurableObjectStorage): Promise<TempVoiceStore> {
  const raw = await storage.get<TempVoiceStore>(STORE_KEY)
  if (!raw || typeof raw !== 'object') return emptyTempVoiceStore()
  return {
    channels: raw.channels ?? {},
    occupancy: raw.occupancy ?? {},
    creating: raw.creating ?? {},
    lastSpawnAt: raw.lastSpawnAt ?? {},
    occupancyTrusted: raw.occupancyTrusted !== false,
    resumeGraceUntil: typeof raw.resumeGraceUntil === 'number' ? raw.resumeGraceUntil : undefined,
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
    const botId = d.user?.id ?? null
    ctx.setBotUserId(botId)
    if (d.session_id) {
      const session = ctx.getSession()
      ctx.setSession(
        applyReady({
          session,
          now: Date.now(),
          sessionId: d.session_id,
          resumeUrl: d.resume_gateway_url ?? null,
          seq: session.seq,
          botUserId: botId,
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
    // Prefer RESUME over IDENTIFY — do not re-run GUILD_CREATE hydrate.
    // Distrust occupancy until grace reconcile (alarm) or next full IDENTIFY.
    await ctx.enqueueVoice(async () => {
      const store = await loadTempVoiceStore(ctx.storage)
      await saveTempVoiceStore(ctx.storage, markOccupancyUntrusted(store))
    })
    // Grace cleanup runs on next heartbeat alarm (shouldReconcileAfterResume) — do not
    // steal the heartbeat schedule with a dedicated 25s alarm.
    console.log('gateway RESUMED occupancy_untrusted grace_ms=25000')
    return
  }

  if (t === 'GUILD_CREATE') {
    await ctx.enqueueVoice(() => onGuildCreate(ctx, packet.d))
    return
  }

  if (t === 'VOICE_STATE_UPDATE') {
    await ctx.enqueueVoice(() => onVoiceStateUpdate(ctx, packet.d as VoiceStateUpdate))
    return
  }

  if (t !== 'MESSAGE_CREATE') return
  const msg = packet.d as GatewayMessage
  const botId = ctx.getBotUserId() ?? undefined
  const watchId = ctx.env.DISCORD_GITHUB_WATCH_CHANNEL_ID
  const newsId = ctx.env.DISCORD_NEWS_ACTU_CHANNEL_ID
  const digestId = ctx.env.DISCORD_DAILY_DIGEST_CHANNEL_ID
  const watch = watchId ? planGithubWatchMessage(msg, watchId, botId) : null
  const news = newsId ? planNewsActuMessage(msg, newsId, botId) : null
  const digest = digestId ? planDailyDigestMessage(msg, digestId, botId) : null

  // A rejected top-level message is about to be deleted. Forwarding it would hand Lyra
  // a ghost to answer, and her reply is bot-authored — exempt from the same channel
  // rule — so it would land as prose in a channel the rule keeps link-only.
  const rejected = watch?.type === 'reject' || news?.type === 'reject' || digest?.type === 'reject'
  if (!rejected) {
    scheduleLyraMentionForward(
      {
        webhookUrl: ctx.env.LYRA_GROK_WEBHOOK_URL,
        webhookSecret: ctx.env.LYRA_GROK_WEBHOOK_SECRET,
        memberRoleId: ctx.env.DISCORD_MEMBER_ROLE_ID,
        configuredGuildId: ctx.env.DISCORD_GUILD_ID,
        storage: ctx.storage,
        waitUntil: ctx.waitUntil,
        botToken: ctx.env.DISCORD_BOT_TOKEN,
        adoptThreadOnly: [watch, news, digest].some((p) => p?.type === 'accept'),
        sleep: ctx.sleep,
      },
      msg,
    )
  }

  if (watch) await onGithubWatchMessage(ctx, msg, watch)
  if (news) await onNewsActuMessage(ctx, msg, news)
  if (digest) await onDailyDigestMessage(ctx, msg, digest)
}

async function onGuildCreate(ctx: GatewayDispatchCtx, d: unknown): Promise<void> {
  const guild = d as {
    id?: string
    voice_states?: Array<{ channel_id?: string | null; user_id?: string }>
  }
  if (!guild.id || guild.id !== ctx.env.DISCORD_GUILD_ID) return
  await rememberGuildPrivilege(ctx.storage, d, ctx.env.DISCORD_GUILD_ID)
  if (!ctx.env.DISCORD_VOICE_HUB_CHANNEL_ID) return

  let store = await loadTempVoiceStore(ctx.storage)
  store = hydrateOccupancyFromVoiceStates(store, guild.voice_states ?? [])
  store = markOccupancyTrusted(store)
  const cleaned = await cleanupEmptyTempVoices({
    token: ctx.env.DISCORD_BOT_TOKEN,
    store,
  })
  await saveTempVoiceStore(ctx.storage, cleaned.store)
  if (cleaned.deleted.length) {
    console.log('temp-voice stale cleanup', cleaned.deleted)
  }
}

/** After RESUME grace — trust occupancy again and delete empty tracked rooms. */
export async function reconcileTempVoiceAfterResume(input: {
  token: string
  storage: DurableObjectStorage
  now?: number
}): Promise<void> {
  let store = await loadTempVoiceStore(input.storage)
  if (!shouldReconcileAfterResume(store, input.now ?? Date.now())) return
  store = markOccupancyTrusted(store)
  const cleaned = await cleanupEmptyTempVoices({ token: input.token, store })
  await saveTempVoiceStore(input.storage, cleaned.store)
  if (cleaned.deleted.length) {
    console.log('temp-voice resume reconcile cleanup', cleaned.deleted)
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

async function onGithubWatchMessage(
  ctx: GatewayDispatchCtx,
  msg: GatewayMessage,
  action: GithubWatchAction,
): Promise<void> {
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

async function onNewsActuMessage(
  ctx: GatewayDispatchCtx,
  msg: GatewayMessage,
  action: NewsActuAction,
): Promise<void> {
  if (action.type === 'ignore') return

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

  try {
    const result = await enforceNewsActu({
      token: ctx.env.DISCORD_BOT_TOKEN,
      msg,
      action,
      noticeTtlMs: action.type === 'reject' ? 12_000 : undefined,
      sleep: action.type === 'reject' ? sleep : undefined,
    })
    console.log('news-actu', result.done, 'msg', msg.id)
  } catch (e) {
    console.error('news-actu enforce failed', e)
  }
}

async function onDailyDigestMessage(
  ctx: GatewayDispatchCtx,
  msg: GatewayMessage,
  action: DailyDigestAction,
): Promise<void> {
  if (action.type === 'ignore') return

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

  try {
    const result = await enforceDailyDigest({
      token: ctx.env.DISCORD_BOT_TOKEN,
      msg,
      action,
      noticeTtlMs: action.type === 'reject' ? 12_000 : undefined,
      sleep: action.type === 'reject' ? sleep : undefined,
    })
    console.log('daily-digest', result.done, 'msg', msg.id)
  } catch (e) {
    console.error('daily-digest enforce failed', e)
  }
}
