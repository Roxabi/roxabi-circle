/**
 * MESSAGE_CREATE: channel-rule plans, @Lyra forward, then awaited enforcers.
 * Extracted from gateway-handlers.ts for the 300-line gate.
 */

import { enforceDailyDigest, planDailyDigestMessage } from './daily-digest'
import type { GatewayDispatchCtx } from './gateway-handlers'
import { enforceGithubWatch, type GatewayMessage, planGithubWatchMessage } from './github-watch'
import { scheduleLyraMentionForward } from './lyra-mention'
import { enforceNewsActu, planNewsActuMessage } from './news-actu'

type RuledAction = { type: 'ignore' | 'accept' | 'reject' }

export async function handleMessageCreate(
  ctx: GatewayDispatchCtx,
  msg: GatewayMessage,
): Promise<void> {
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

  if (watch) await enforceRuledChannel(ctx, msg, watch, 'github-watch', enforceGithubWatch)
  if (news) await enforceRuledChannel(ctx, msg, news, 'news-actu', enforceNewsActu)
  if (digest) await enforceRuledChannel(ctx, msg, digest, 'daily-digest', enforceDailyDigest)
}

async function enforceRuledChannel<A extends RuledAction>(
  ctx: GatewayDispatchCtx,
  msg: GatewayMessage,
  action: A,
  label: string,
  enforce: (input: {
    token: string
    msg: GatewayMessage
    action: A
    noticeTtlMs?: number
    sleep?: (ms: number) => Promise<void>
  }) => Promise<{ done: string }>,
): Promise<void> {
  if (action.type === 'ignore') return

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

  try {
    const result = await enforce({
      token: ctx.env.DISCORD_BOT_TOKEN,
      msg,
      action,
      noticeTtlMs: action.type === 'reject' ? 12_000 : undefined,
      sleep: action.type === 'reject' ? sleep : undefined,
    })
    console.log(label, result.done, 'msg', msg.id)
  } catch (e) {
    console.error(`${label} enforce failed`, e)
  }
}
