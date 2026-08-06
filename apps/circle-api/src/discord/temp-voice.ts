/**
 * Temporary voice rooms — pure plan helpers + permission bits.
 * REST side effects live in temp-voice-rest.ts (unit-tested here).
 */

// Permission bits (voice + channel control)
const CREATE_INVITE = 1 << 0
const MANAGE_CHANNELS = 1 << 4
const PRIORITY_SPEAKER = 1 << 8
const STREAM = 1 << 9
const VIEW = 1 << 10
const SEND_MESSAGES = 1 << 11
const MANAGE_MESSAGES = 1 << 13
const EMBED_LINKS = 1 << 14
const ATTACH_FILES = 1 << 15
const READ_HISTORY = 1 << 16
const CONNECT = 1 << 20
const SPEAK = 1 << 21
const MUTE_MEMBERS = 1 << 22
const DEAFEN_MEMBERS = 1 << 23
const MOVE_MEMBERS = 1 << 24
const USE_VAD = 1 << 25
const MANAGE_ROLES = 1 << 28

/** member: view + connect + speak + stream + voice activity */
export const MEMBER_VOICE_ALLOW = STREAM | VIEW | CONNECT | SPEAK | USE_VAD
/**
 * Creator “channel admin” on the temp room (member overwrite type=1).
 * Not guild Administrator — scoped to this channel only.
 */
export const OWNER_VOICE_ALLOW =
  MEMBER_VOICE_ALLOW |
  CREATE_INVITE |
  MANAGE_CHANNELS |
  MANAGE_ROLES |
  PRIORITY_SPEAKER |
  MUTE_MEMBERS |
  DEAFEN_MEMBERS |
  MOVE_MEMBERS |
  SEND_MESSAGES |
  MANAGE_MESSAGES |
  EMBED_LINKS |
  ATTACH_FILES |
  READ_HISTORY
/** @everyone: hide + no connect */
export const EVERYONE_VOICE_DENY = VIEW | CONNECT

export type VoiceStateUpdate = {
  guild_id?: string | null
  channel_id?: string | null
  user_id: string
  member?: {
    user?: { id?: string; bot?: boolean; username?: string; global_name?: string | null }
    nick?: string | null
  }
}

export type TempVoiceMeta = {
  ownerId: string
  createdAt: number
  name: string
}

export type TempVoiceStore = {
  /** channelId → meta for rooms we created */
  channels: Record<string, TempVoiceMeta>
  /** channelId → user ids currently in that channel (from VOICE_STATE_UPDATE) */
  occupancy: Record<string, string[]>
  /** userId → in-flight create guard (timestamp ms) */
  creating?: Record<string, number>
}

export function emptyTempVoiceStore(): TempVoiceStore {
  return { channels: {}, occupancy: {}, creating: {} }
}

/** Discord channel name: strip junk, max 100. */
export function tempVoiceChannelName(displayName: string): string {
  const base = displayName
    .normalize('NFKC')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  const label = base || 'vocal'
  return `🔊 ${label}`.slice(0, 100)
}

export function displayNameFromVoiceState(vs: VoiceStateUpdate): string {
  const m = vs.member
  return m?.nick || m?.user?.global_name || m?.user?.username || `user-${vs.user_id.slice(-4)}`
}

export type TempVoicePlan =
  | { type: 'ignore'; reason: string }
  | { type: 'spawn'; userId: string; displayName: string }
  | { type: 'reuse'; userId: string; channelId: string }
  | { type: 'cleanup'; channelIds: string[] }

/**
 * Plan reaction to a single VOICE_STATE_UPDATE.
 * `previousChannelId` is the channel the user left (from our occupancy before update), or null.
 */
export function planTempVoiceEvent(input: {
  vs: VoiceStateUpdate
  hubChannelId: string
  guildId: string
  botUserId?: string
  store: TempVoiceStore
  previousChannelId: string | null
}): TempVoicePlan {
  const { vs, hubChannelId, guildId, botUserId, store } = input
  if (!hubChannelId) return { type: 'ignore', reason: 'no_hub_configured' }
  if (!guildId || (vs.guild_id && vs.guild_id !== guildId)) {
    return { type: 'ignore', reason: 'other_guild' }
  }
  if (!vs.user_id) return { type: 'ignore', reason: 'no_user' }
  if (botUserId && vs.user_id === botUserId) return { type: 'ignore', reason: 'self' }
  if (vs.member?.user?.bot) return { type: 'ignore', reason: 'bot' }

  const joined = vs.channel_id ?? null
  const left = input.previousChannelId

  if (joined === hubChannelId) {
    const existing = Object.entries(store.channels).find(([, m]) => m.ownerId === vs.user_id)
    if (existing) {
      return { type: 'reuse', userId: vs.user_id, channelId: existing[0] }
    }
    const started = store.creating?.[vs.user_id]
    if (started && Date.now() - started < 15_000) {
      return { type: 'ignore', reason: 'create_in_flight' }
    }
    return {
      type: 'spawn',
      userId: vs.user_id,
      displayName: displayNameFromVoiceState(vs),
    }
  }

  const emptyTracked: string[] = []
  for (const channelId of Object.keys(store.channels)) {
    if (channelId === left || channelId === joined) {
      const occ = store.occupancy[channelId] ?? []
      if (occ.length === 0) emptyTracked.push(channelId)
    }
  }
  if (left && store.channels[left]) {
    const occ = store.occupancy[left] ?? []
    if (occ.length === 0 && !emptyTracked.includes(left)) emptyTracked.push(left)
  }

  if (emptyTracked.length) {
    return { type: 'cleanup', channelIds: emptyTracked }
  }

  return { type: 'ignore', reason: 'no_op' }
}

/** Apply voice state to occupancy; returns previous channel id for this user (if any). */
export function applyOccupancy(
  store: TempVoiceStore,
  userId: string,
  newChannelId: string | null,
): { previousChannelId: string | null; store: TempVoiceStore } {
  let previousChannelId: string | null = null
  const occupancy: Record<string, string[]> = {}

  for (const [ch, users] of Object.entries(store.occupancy)) {
    const next = users.filter((id) => {
      if (id === userId) {
        previousChannelId = ch
        return false
      }
      return true
    })
    if (next.length) occupancy[ch] = next
  }

  if (newChannelId) {
    const list = occupancy[newChannelId] ? [...occupancy[newChannelId]] : []
    if (!list.includes(userId)) list.push(userId)
    occupancy[newChannelId] = list
  }

  return {
    previousChannelId,
    store: { ...store, occupancy },
  }
}

/** Hydrate occupancy from GUILD_CREATE voice_states (partial). */
export function hydrateOccupancyFromVoiceStates(
  store: TempVoiceStore,
  voiceStates: Array<{ channel_id?: string | null; user_id?: string }>,
): TempVoiceStore {
  const occupancy: Record<string, string[]> = {}
  for (const vs of voiceStates) {
    if (!vs.user_id || !vs.channel_id) continue
    const list = occupancy[vs.channel_id] ?? []
    if (!list.includes(vs.user_id)) list.push(vs.user_id)
    occupancy[vs.channel_id] = list
  }
  return { ...store, occupancy }
}

/** Empty tracked rooms after hydrate (restart cleanup). */
export function planStaleCleanup(store: TempVoiceStore): string[] {
  return Object.keys(store.channels).filter((id) => (store.occupancy[id] ?? []).length === 0)
}

export function memberVoiceOverwrites(input: {
  guildId: string
  memberRoleId: string
  ownerId: string
  botRoleId?: string
}): Array<{ id: string; type: number; allow: string; deny: string }> {
  const overwrites = [
    { id: input.guildId, type: 0, allow: '0', deny: String(EVERYONE_VOICE_DENY) },
    {
      id: input.memberRoleId,
      type: 0,
      allow: String(MEMBER_VOICE_ALLOW),
      deny: '0',
    },
    {
      id: input.ownerId,
      type: 1,
      allow: String(OWNER_VOICE_ALLOW),
      deny: '0',
    },
  ]
  if (input.botRoleId) {
    const botAllow = MEMBER_VOICE_ALLOW | MANAGE_CHANNELS | MANAGE_MESSAGES
    overwrites.push({
      id: input.botRoleId,
      type: 0,
      allow: String(botAllow),
      deny: '0',
    })
  }
  return overwrites
}
