import { describe, expect, it, vi } from 'vitest'
import {
  applyOccupancy,
  emptyTempVoiceStore,
  MAX_TEMP_VOICE_ROOMS,
  MEMBER_VOICE_ALLOW,
  markOccupancyTrusted,
  markOccupancyUntrusted,
  memberVoiceOverwrites,
  OWNER_VOICE_ALLOW,
  planStaleCleanup,
  planTempVoiceEvent,
  shouldReconcileAfterResume,
  type TempVoiceStore,
  tempVoiceChannelName,
  type VoiceStateUpdate,
} from '../src/discord/temp-voice'
import {
  cleanupEmptyTempVoices,
  createTempVoiceChannel,
  deleteChannel,
  handleTempVoiceUpdate,
  moveMemberToVoice,
} from '../src/discord/temp-voice-rest'

const hub = 'hub1'
const guild = 'g1'
const owner = 'u1'
const memberRole = 'role_member'

function vs(partial: Partial<VoiceStateUpdate> & { user_id: string }): VoiceStateUpdate {
  return {
    guild_id: guild,
    member: {
      user: { id: partial.user_id, bot: false, username: 'alice' },
      roles: [memberRole],
    },
    ...partial,
  }
}

const planBase = {
  hubChannelId: hub,
  guildId: guild,
  memberRoleId: memberRole,
  previousChannelId: null as string | null,
}

describe('tempVoiceChannelName', () => {
  it('prefixes and truncates', () => {
    expect(tempVoiceChannelName('alice')).toBe('🔊 alice')
    expect(tempVoiceChannelName('x'.repeat(200)).length).toBeLessThanOrEqual(100)
  })
  it('falls back on empty', () => {
    expect(tempVoiceChannelName('   ')).toBe('🔊 vocal')
  })
})

describe('applyOccupancy', () => {
  it('moves user between channels', () => {
    let store: TempVoiceStore = {
      channels: {},
      occupancy: { a: [owner, 'u2'], b: ['u3'] },
    }
    const r1 = applyOccupancy(store, owner, 'b')
    expect(r1.previousChannelId).toBe('a')
    expect(r1.store.occupancy.a).toEqual(['u2'])
    expect(r1.store.occupancy.b?.sort()).toEqual(['u1', 'u3'].sort())
    store = r1.store
    const r2 = applyOccupancy(store, owner, null)
    expect(r2.previousChannelId).toBe('b')
    expect(r2.store.occupancy.b).toEqual(['u3'])
  })
})

describe('planTempVoiceEvent', () => {
  it('spawns when joining hub with no owned room', () => {
    const plan = planTempVoiceEvent({
      ...planBase,
      vs: vs({ user_id: owner, channel_id: hub }),
      store: emptyTempVoiceStore(),
    })
    expect(plan.type).toBe('spawn')
    if (plan.type === 'spawn') expect(plan.displayName).toBe('alice')
  })

  it('reuses owned room on re-join hub', () => {
    const store: TempVoiceStore = {
      channels: { room9: { ownerId: owner, createdAt: 1, name: '🔊 alice' } },
      occupancy: {},
    }
    const plan = planTempVoiceEvent({
      ...planBase,
      vs: vs({ user_id: owner, channel_id: hub }),
      store,
    })
    expect(plan).toEqual({ type: 'reuse', userId: owner, channelId: 'room9' })
  })

  it('ignores bots', () => {
    const plan = planTempVoiceEvent({
      ...planBase,
      vs: {
        user_id: 'bot1',
        guild_id: guild,
        channel_id: hub,
        member: { user: { id: 'bot1', bot: true, username: 'Lyra' }, roles: [memberRole] },
      },
      store: emptyTempVoiceStore(),
    })
    expect(plan.type).toBe('ignore')
  })

  it('ignores non-members when role required', () => {
    const plan = planTempVoiceEvent({
      ...planBase,
      vs: {
        user_id: owner,
        guild_id: guild,
        channel_id: hub,
        member: { user: { id: owner, bot: false, username: 'alice' }, roles: [] },
      },
      store: emptyTempVoiceStore(),
    })
    expect(plan).toEqual({ type: 'ignore', reason: 'not_member' })
  })

  it('ignores other_guild and no_hub', () => {
    expect(
      planTempVoiceEvent({
        ...planBase,
        hubChannelId: '',
        vs: vs({ user_id: owner, channel_id: hub }),
        store: emptyTempVoiceStore(),
      }),
    ).toEqual({ type: 'ignore', reason: 'no_hub_configured' })
    expect(
      planTempVoiceEvent({
        ...planBase,
        vs: vs({ user_id: owner, channel_id: hub, guild_id: 'other' }),
        store: emptyTempVoiceStore(),
      }),
    ).toEqual({ type: 'ignore', reason: 'other_guild' })
  })

  it('hits room_cap and spawn_cooldown', () => {
    const channels: TempVoiceStore['channels'] = {}
    for (let i = 0; i < MAX_TEMP_VOICE_ROOMS; i++) {
      // owners must not include `owner` or plan returns reuse instead of cap
      channels[`c${i}`] = { ownerId: `other${i}`, createdAt: 1, name: 'n' }
    }
    expect(
      planTempVoiceEvent({
        ...planBase,
        vs: vs({ user_id: owner, channel_id: hub }),
        store: { channels, occupancy: {} },
      }),
    ).toEqual({ type: 'ignore', reason: 'room_cap' })

    const now = 1_000_000
    expect(
      planTempVoiceEvent({
        ...planBase,
        now,
        vs: vs({ user_id: owner, channel_id: hub }),
        store: {
          channels: {},
          occupancy: {},
          lastSpawnAt: { [owner]: now - 5_000 },
        },
      }),
    ).toEqual({ type: 'ignore', reason: 'spawn_cooldown' })
  })

  it('skips cleanup while occupancy untrusted', () => {
    const store: TempVoiceStore = {
      channels: { room9: { ownerId: owner, createdAt: 1, name: '🔊 alice' } },
      occupancy: {},
      occupancyTrusted: false,
    }
    const plan = planTempVoiceEvent({
      ...planBase,
      vs: vs({ user_id: owner, channel_id: null }),
      store,
      previousChannelId: 'room9',
    })
    expect(plan).toEqual({ type: 'ignore', reason: 'occupancy_untrusted' })
  })

  it('cleans up empty owned room after leave', () => {
    const store: TempVoiceStore = {
      channels: { room9: { ownerId: owner, createdAt: 1, name: '🔊 alice' } },
      occupancy: {},
    }
    const plan = planTempVoiceEvent({
      ...planBase,
      vs: vs({ user_id: owner, channel_id: null }),
      store,
      previousChannelId: 'room9',
    })
    expect(plan.type).toBe('cleanup')
    if (plan.type === 'cleanup') expect(plan.channelIds).toContain('room9')
  })

  it('does not cleanup non-empty room', () => {
    const store: TempVoiceStore = {
      channels: { room9: { ownerId: owner, createdAt: 1, name: '🔊 alice' } },
      occupancy: { room9: ['u2'] },
    }
    const plan = planTempVoiceEvent({
      ...planBase,
      vs: vs({ user_id: owner, channel_id: null }),
      store,
      previousChannelId: 'room9',
    })
    expect(plan.type).toBe('ignore')
  })

  it('blocks double spawn while create in flight', () => {
    const store: TempVoiceStore = {
      channels: {},
      occupancy: {},
      creating: { [owner]: Date.now() },
    }
    const plan = planTempVoiceEvent({
      ...planBase,
      vs: vs({ user_id: owner, channel_id: hub }),
      store,
    })
    expect(plan).toEqual({ type: 'ignore', reason: 'create_in_flight' })
  })
})

describe('occupancy trust helpers', () => {
  it('marks untrusted with grace then reconciles', () => {
    const store = markOccupancyUntrusted(emptyTempVoiceStore(), 25_000, 1000)
    expect(store.occupancyTrusted).toBe(false)
    expect(store.resumeGraceUntil).toBe(26_000)
    expect(shouldReconcileAfterResume(store, 25_999)).toBe(false)
    expect(shouldReconcileAfterResume(store, 26_000)).toBe(true)
    expect(markOccupancyTrusted(store).occupancyTrusted).toBe(true)
  })

  it('planStaleCleanup skips untrusted', () => {
    const store: TempVoiceStore = {
      channels: { a: { ownerId: '1', createdAt: 1, name: 'a' } },
      occupancy: {},
      occupancyTrusted: false,
    }
    expect(planStaleCleanup(store)).toEqual([])
  })
})

describe('planStaleCleanup', () => {
  it('lists empty tracked rooms', () => {
    const store: TempVoiceStore = {
      channels: {
        a: { ownerId: '1', createdAt: 1, name: 'a' },
        b: { ownerId: '2', createdAt: 1, name: 'b' },
      },
      occupancy: { b: ['2'] },
    }
    expect(planStaleCleanup(store)).toEqual(['a'])
  })
})

describe('MEMBER_VOICE_ALLOW', () => {
  it('includes USE_VAD so clients are not forced to PTT', () => {
    const USE_VAD = 1 << 25
    expect(MEMBER_VOICE_ALLOW & USE_VAD).toBeTruthy()
  })
})

describe('OWNER_VOICE_ALLOW + overwrites', () => {
  it('gives creator channel admin bits', () => {
    const MANAGE_CHANNELS = 1 << 4
    const MUTE = 1 << 22
    expect(OWNER_VOICE_ALLOW & MANAGE_CHANNELS).toBeTruthy()
    expect(OWNER_VOICE_ALLOW & MUTE).toBeTruthy()
    expect(OWNER_VOICE_ALLOW & MEMBER_VOICE_ALLOW).toBe(MEMBER_VOICE_ALLOW)
  })

  it('includes type=1 member overwrite for ownerId', () => {
    const ows = memberVoiceOverwrites({
      guildId: 'g1',
      memberRoleId: 'role_member',
      ownerId: 'user_owner',
    })
    const ow = ows.find((o) => o.id === 'user_owner')
    expect(ow?.type).toBe(1)
    expect(ow?.allow).toBe(String(OWNER_VOICE_ALLOW))
  })
})

describe('temp-voice REST (fetch mock)', () => {
  it('createTempVoiceChannel returns id on 201', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id: 'ch1' }), { status: 201 })),
    )
    const r = await createTempVoiceChannel({
      token: 't',
      guildId: guild,
      categoryId: 'cat',
      memberRoleId: memberRole,
      name: '🔊 a',
      ownerId: owner,
    })
    expect(r).toEqual({ ok: true, channelId: 'ch1' })
    vi.unstubAllGlobals()
  })

  it('deleteChannel treats 404 as ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    )
    expect(await deleteChannel('t', 'gone')).toEqual({ ok: true })
    vi.unstubAllGlobals()
  })

  it('moveMemberToVoice maps errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'nope' }), { status: 403 })),
    )
    const r = await moveMemberToVoice({
      token: 't',
      guildId: guild,
      userId: owner,
      channelId: 'ch1',
    })
    expect(r.ok).toBe(false)
    vi.unstubAllGlobals()
  })

  it('handleTempVoiceUpdate spawn moves user', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input)
      if (url.includes('/channels') && !url.includes('/members')) {
        return new Response(JSON.stringify({ id: 'room_new' }), { status: 201 })
      }
      return new Response(null, { status: 204 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await handleTempVoiceUpdate({
      token: 't',
      guildId: guild,
      hubChannelId: hub,
      categoryId: 'cat',
      memberRoleId: memberRole,
      store: emptyTempVoiceStore(),
      vs: vs({ user_id: owner, channel_id: hub }),
    })
    expect(result.done).toBe('spawn:room_new')
    expect(result.store.channels.room_new?.ownerId).toBe(owner)
    vi.unstubAllGlobals()
  })

  it('cleanupEmptyTempVoices deletes empty tracked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    )
    const store: TempVoiceStore = {
      channels: { empty1: { ownerId: '1', createdAt: 1, name: 'n' } },
      occupancy: {},
    }
    const r = await cleanupEmptyTempVoices({ token: 't', store })
    expect(r.deleted).toEqual(['empty1'])
    expect(r.store.channels.empty1).toBeUndefined()
    vi.unstubAllGlobals()
  })
})
