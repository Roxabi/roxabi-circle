/**
 * Temporary voice rooms — Discord REST + side-effect handlers.
 */

import {
  applyOccupancy,
  memberVoiceOverwrites,
  planStaleCleanup,
  planTempVoiceEvent,
  type TempVoiceStore,
  tempVoiceChannelName,
  type VoiceStateUpdate,
} from './temp-voice'

const API = 'https://discord.com/api/v10'
const GUILD_VOICE = 2

async function discord(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'RoxabiCircle (temp-voice, 0.1)',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }
  }
  return { status: res.status, data }
}

export async function createTempVoiceChannel(input: {
  token: string
  guildId: string
  categoryId: string
  memberRoleId: string
  name: string
  ownerId: string
}): Promise<{ ok: true; channelId: string } | { ok: false; error: string }> {
  const { status, data } = await discord(input.token, 'POST', `/guilds/${input.guildId}/channels`, {
    name: input.name.slice(0, 100),
    type: GUILD_VOICE,
    parent_id: input.categoryId,
    bitrate: 64_000,
    user_limit: 0,
    permission_overwrites: memberVoiceOverwrites({
      guildId: input.guildId,
      memberRoleId: input.memberRoleId,
      ownerId: input.ownerId,
    }),
    reason: `Temp voice for ${input.ownerId}`,
  })
  if (status !== 200 && status !== 201) {
    return { ok: false, error: `create_${status}: ${JSON.stringify(data).slice(0, 200)}` }
  }
  const id = (data as { id?: string })?.id
  if (!id) return { ok: false, error: 'create_no_id' }
  return { ok: true, channelId: id }
}

export async function moveMemberToVoice(input: {
  token: string
  guildId: string
  userId: string
  channelId: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { status, data } = await discord(
    input.token,
    'PATCH',
    `/guilds/${input.guildId}/members/${input.userId}`,
    { channel_id: input.channelId },
  )
  if (status === 200 || status === 204) return { ok: true }
  return { ok: false, error: `move_${status}: ${JSON.stringify(data).slice(0, 180)}` }
}

export async function deleteChannel(
  token: string,
  channelId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { status, data } = await discord(token, 'DELETE', `/channels/${channelId}`)
  if (status === 200 || status === 204) return { ok: true }
  if (status === 404) return { ok: true }
  return { ok: false, error: `delete_${status}: ${JSON.stringify(data).slice(0, 180)}` }
}

/**
 * Full handle: apply occupancy → plan → side effects → return next store + log line.
 */
export async function handleTempVoiceUpdate(input: {
  token: string
  guildId: string
  hubChannelId: string
  categoryId: string
  memberRoleId: string
  botUserId?: string
  store: TempVoiceStore
  vs: VoiceStateUpdate
}): Promise<{ store: TempVoiceStore; done: string }> {
  const { token, guildId, hubChannelId, categoryId, memberRoleId, botUserId, vs } = input

  const applied = applyOccupancy(input.store, vs.user_id, vs.channel_id ?? null)
  let store = applied.store
  const previousChannelId = applied.previousChannelId

  const plan = planTempVoiceEvent({
    vs,
    hubChannelId,
    guildId,
    botUserId,
    store,
    previousChannelId,
  })

  if (plan.type === 'ignore') {
    return { store, done: `ignore:${plan.reason}` }
  }

  if (plan.type === 'reuse') {
    const moved = await moveMemberToVoice({
      token,
      guildId,
      userId: plan.userId,
      channelId: plan.channelId,
    })
    return {
      store,
      done: moved.ok ? `reuse:${plan.channelId}` : `reuse_fail:${moved.error}`,
    }
  }

  if (plan.type === 'spawn') {
    return runSpawn({
      token,
      guildId,
      hubChannelId,
      categoryId,
      memberRoleId,
      store,
      plan,
    })
  }

  const remaining = { ...store.channels }
  const occupancy = { ...store.occupancy }
  const deleted: string[] = []
  for (const channelId of plan.channelIds) {
    const r = await deleteChannel(token, channelId)
    if (r.ok) {
      deleted.push(channelId)
      delete remaining[channelId]
      delete occupancy[channelId]
    }
  }
  store = { ...store, channels: remaining, occupancy }
  return { store, done: `cleanup:${deleted.join(',') || 'none'}` }
}

async function runSpawn(input: {
  token: string
  guildId: string
  hubChannelId: string
  categoryId: string
  memberRoleId: string
  store: TempVoiceStore
  plan: { userId: string; displayName: string }
}): Promise<{ store: TempVoiceStore; done: string }> {
  const { token, guildId, hubChannelId, categoryId, memberRoleId, plan } = input
  let store = input.store
  const creating = { ...(store.creating ?? {}), [plan.userId]: Date.now() }
  store = { ...store, creating }

  const name = tempVoiceChannelName(plan.displayName)
  const created = await createTempVoiceChannel({
    token,
    guildId,
    categoryId,
    memberRoleId,
    name,
    ownerId: plan.userId,
  })

  if (!created.ok) {
    const { [plan.userId]: _, ...restCreating } = store.creating ?? {}
    store = { ...store, creating: restCreating }
    return { store, done: `spawn_fail:${created.error}` }
  }

  const channels = {
    ...store.channels,
    [created.channelId]: {
      ownerId: plan.userId,
      createdAt: Date.now(),
      name,
    },
  }
  const occupancy = {
    ...store.occupancy,
    [created.channelId]: [plan.userId],
  }
  if (occupancy[hubChannelId]) {
    occupancy[hubChannelId] = occupancy[hubChannelId].filter((id) => id !== plan.userId)
    if (!occupancy[hubChannelId].length) delete occupancy[hubChannelId]
  }
  const { [plan.userId]: __, ...restCreating } = store.creating ?? {}
  store = { channels, occupancy, creating: restCreating }

  const moved = await moveMemberToVoice({
    token,
    guildId,
    userId: plan.userId,
    channelId: created.channelId,
  })
  if (!moved.ok) {
    await deleteChannel(token, created.channelId)
    const { [created.channelId]: ___, ...restCh } = store.channels
    const { [created.channelId]: ____, ...restOcc } = store.occupancy
    store = { ...store, channels: restCh, occupancy: restOcc }
    return { store, done: `spawn_move_fail:${moved.error}` }
  }
  return { store, done: `spawn:${created.channelId}` }
}

/** After GUILD_CREATE hydrate — delete tracked rooms that are empty. */
export async function cleanupEmptyTempVoices(input: {
  token: string
  store: TempVoiceStore
}): Promise<{ store: TempVoiceStore; deleted: string[] }> {
  const empty = planStaleCleanup(input.store)
  if (!empty.length) return { store: input.store, deleted: [] }

  const remaining = { ...input.store.channels }
  const occupancy = { ...input.store.occupancy }
  const deleted: string[] = []
  for (const channelId of empty) {
    const r = await deleteChannel(input.token, channelId)
    if (r.ok) {
      deleted.push(channelId)
      delete remaining[channelId]
      delete occupancy[channelId]
    }
  }
  return {
    store: { ...input.store, channels: remaining, occupancy },
    deleted,
  }
}
