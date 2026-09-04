/**
 * Forward @Lyra mentions to the Grok Bot webhook (fire-and-forget).
 * Does not open a Gateway, does not reply on Discord.
 */

import type { GatewayMessage } from './github-watch'
import { resolveLyraReplyThread } from './lyra-thread'

/** Lyra bot user id (same snowflake as the Discord application). */
export const LYRA_DISCORD_USER_ID = '1534228521420067046'

export const LYRA_MENTION_SOURCE = 'discord' as const

export const GUILD_PRIVILEGE_KEY = 'guild_privilege_v1'

/** Discord PermissionFlagsBits.Administrator */
const ADMINISTRATOR = 8n

export const LYRA_PAYLOAD_KEYS = [
  'source',
  'guildId',
  'channelId',
  'messageId',
  'authorId',
  'authorUsername',
  'content',
] as const

export type LyraMentionPayload = {
  source: typeof LYRA_MENTION_SOURCE
  guildId: string
  channelId: string
  messageId: string
  authorId: string
  authorUsername: string
  content: string
}

export type LyraMentionAction =
  | { type: 'ignore'; reason: string }
  | { type: 'forward'; payload: LyraMentionPayload }

export type GuildPrivilege = {
  ownerId: string | null
  adminRoleIds: string[]
}

export type PrivilegeStorage = {
  get<T = unknown>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
}

export type LyraMentionRuntime = {
  webhookUrl?: string | null
  /** Grok Bot routine sender key → Authorization: Bearer. Required with URL. */
  webhookSecret?: string | null
  memberRoleId?: string
  configuredGuildId?: string
  lyraUserId?: string
  storage: PrivilegeStorage
  waitUntil?: (promise: Promise<unknown>) => void
  fetchImpl?: typeof fetch
  /** Bot token used to open the reply thread. Without it Lyra answers in place. */
  botToken?: string
  /** Channel automation will open the thread: adopt it, do not race it. */
  adoptThreadOnly?: boolean
  sleep?: (ms: number) => Promise<void>
}

export function hasAdministratorPermission(permissions?: string | null): boolean {
  if (!permissions) return false
  try {
    return (BigInt(permissions) & ADMINISTRATOR) === ADMINISTRATOR
  } catch {
    return false
  }
}

export function extractGuildPrivilege(guild: {
  owner_id?: string
  roles?: Array<{ id?: string; permissions?: string }>
}): GuildPrivilege {
  const adminRoleIds: string[] = []
  for (const role of guild.roles ?? []) {
    if (role.id && hasAdministratorPermission(role.permissions)) {
      adminRoleIds.push(role.id)
    }
  }
  return {
    ownerId: typeof guild.owner_id === 'string' ? guild.owner_id : null,
    adminRoleIds,
  }
}

export async function rememberGuildPrivilege(
  storage: PrivilegeStorage,
  guild: unknown,
  configuredGuildId?: string,
): Promise<void> {
  const g = guild as {
    id?: string
    owner_id?: string
    roles?: Array<{ id?: string; permissions?: string }>
  }
  if (!g.id) return
  if (configuredGuildId && g.id !== configuredGuildId) return
  await storage.put(GUILD_PRIVILEGE_KEY, extractGuildPrivilege(g))
}

export async function loadGuildPrivilege(
  storage: PrivilegeStorage,
): Promise<GuildPrivilege | null> {
  const raw = await storage.get<GuildPrivilege>(GUILD_PRIVILEGE_KEY)
  if (!raw || typeof raw !== 'object') return null
  const adminRoleIds = Array.isArray(raw.adminRoleIds)
    ? raw.adminRoleIds.filter((id): id is string => typeof id === 'string')
    : []
  return {
    ownerId: typeof raw.ownerId === 'string' ? raw.ownerId : null,
    adminRoleIds,
  }
}

export function mentionsLyraUser(
  msg: Pick<GatewayMessage, 'mentions' | 'content'>,
  lyraUserId: string = LYRA_DISCORD_USER_ID,
): boolean {
  if (msg.mentions?.some((u) => u.id === lyraUserId)) return true
  const content = msg.content ?? ''
  return content.includes(`<@${lyraUserId}>`) || content.includes(`<@!${lyraUserId}>`)
}

export function authorAllowedForLyra(input: {
  authorId?: string
  memberRoles?: string[]
  memberPermissions?: string
  memberRoleId?: string
  privilege?: GuildPrivilege | null
}): boolean {
  const authorId = input.authorId
  if (!authorId) return false
  if (input.memberRoleId && input.memberRoles?.includes(input.memberRoleId)) return true
  if (hasAdministratorPermission(input.memberPermissions)) return true
  if (input.privilege?.ownerId && authorId === input.privilege.ownerId) return true
  if (input.privilege?.adminRoleIds?.length && input.memberRoles?.length) {
    const roles = new Set(input.memberRoles)
    if (input.privilege.adminRoleIds.some((id) => roles.has(id))) return true
  }
  return false
}

export function planLyraMentionForward(input: {
  msg: GatewayMessage
  webhookUrl?: string | null
  memberRoleId?: string
  configuredGuildId?: string
  lyraUserId?: string
  privilege?: GuildPrivilege | null
}): LyraMentionAction {
  const webhookUrl = input.webhookUrl?.trim() ?? ''
  if (!webhookUrl) return { type: 'ignore', reason: 'no_webhook' }

  const lyraUserId = input.lyraUserId ?? LYRA_DISCORD_USER_ID
  const msg = input.msg
  const guildId = msg.guild_id ?? ''
  if (!guildId) return { type: 'ignore', reason: 'no_guild' }
  if (input.configuredGuildId && guildId !== input.configuredGuildId) {
    return { type: 'ignore', reason: 'other_guild' }
  }
  if (msg.webhook_id) return { type: 'ignore', reason: 'webhook' }
  if (msg.author?.bot) return { type: 'ignore', reason: 'bot' }
  if (msg.author?.id === lyraUserId) return { type: 'ignore', reason: 'self' }
  if (!mentionsLyraUser(msg, lyraUserId)) return { type: 'ignore', reason: 'no_mention' }
  if (!msg.author?.id) return { type: 'ignore', reason: 'no_author' }

  const allowed = authorAllowedForLyra({
    authorId: msg.author.id,
    memberRoles: msg.member?.roles,
    memberPermissions: msg.member?.permissions,
    memberRoleId: input.memberRoleId,
    privilege: input.privilege,
  })
  if (!allowed) return { type: 'ignore', reason: 'not_allowed' }

  return {
    type: 'forward',
    payload: {
      source: LYRA_MENTION_SOURCE,
      guildId,
      channelId: msg.channel_id,
      messageId: msg.id,
      authorId: msg.author.id,
      authorUsername: msg.author.username ?? '',
      content: msg.content ?? '',
    },
  }
}

export async function postLyraGrokWebhook(
  url: string,
  payload: LyraMentionPayload,
  fetchImpl: typeof fetch = fetch,
  senderKey?: string,
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const key = senderKey?.trim() ?? ''
  if (key) headers.Authorization = `Bearer ${key}`
  const res = await fetchImpl(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    console.error('lyra-mention webhook status', res.status)
  }
}

/**
 * Decide + POST in the background. Caller must not await this on the Gateway path.
 */
export function scheduleLyraMentionForward(runtime: LyraMentionRuntime, msg: GatewayMessage): void {
  const task = runLyraMentionForward(runtime, msg).catch(() => {
    console.error('lyra-mention webhook failed')
  })
  if (runtime.waitUntil) runtime.waitUntil(task)
  else void task
}

async function runLyraMentionForward(
  runtime: LyraMentionRuntime,
  msg: GatewayMessage,
): Promise<void> {
  const webhookUrl = runtime.webhookUrl?.trim() ?? ''
  const webhookSecret = runtime.webhookSecret?.trim() ?? ''
  if (!webhookUrl || !webhookSecret) return

  const base = {
    msg,
    webhookUrl,
    memberRoleId: runtime.memberRoleId,
    configuredGuildId: runtime.configuredGuildId,
    lyraUserId: runtime.lyraUserId,
  }

  let action = planLyraMentionForward(base)
  if (action.type === 'ignore' && action.reason === 'not_allowed') {
    const privilege = await loadGuildPrivilege(runtime.storage)
    action = planLyraMentionForward({ ...base, privilege })
  }
  if (action.type !== 'forward') return

  const thread = await resolveLyraReplyThread({
    token: runtime.botToken,
    msg,
    storage: runtime.storage,
    fetchImpl: runtime.fetchImpl,
    adoptOnly: runtime.adoptThreadOnly,
    sleep: runtime.sleep,
  }).catch((error: unknown) => {
    console.error('lyra-thread resolve failed', error)
    return { channelId: msg.channel_id, created: false, reason: 'create_failed' as const }
  })
  await postLyraGrokWebhook(
    webhookUrl,
    { ...action.payload, channelId: thread.channelId },
    runtime.fetchImpl,
    webhookSecret,
  )
}
