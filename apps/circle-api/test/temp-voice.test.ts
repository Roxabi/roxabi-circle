import { describe, expect, it } from 'vitest'
import {
  applyOccupancy,
  emptyTempVoiceStore,
  MEMBER_VOICE_ALLOW,
  memberVoiceOverwrites,
  OWNER_VOICE_ALLOW,
  planStaleCleanup,
  planTempVoiceEvent,
  type TempVoiceStore,
  tempVoiceChannelName,
  type VoiceStateUpdate,
} from '../src/discord/temp-voice'

const hub = 'hub1'
const guild = 'g1'
const owner = 'u1'

function vs(partial: Partial<VoiceStateUpdate> & { user_id: string }): VoiceStateUpdate {
  return {
    guild_id: guild,
    member: { user: { id: partial.user_id, bot: false, username: 'alice' } },
    ...partial,
  }
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
    const store = emptyTempVoiceStore()
    const plan = planTempVoiceEvent({
      vs: vs({ user_id: owner, channel_id: hub }),
      hubChannelId: hub,
      guildId: guild,
      store,
      previousChannelId: null,
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
      vs: vs({ user_id: owner, channel_id: hub }),
      hubChannelId: hub,
      guildId: guild,
      store,
      previousChannelId: null,
    })
    expect(plan).toEqual({ type: 'reuse', userId: owner, channelId: 'room9' })
  })

  it('ignores bots', () => {
    const plan = planTempVoiceEvent({
      vs: {
        user_id: 'bot1',
        guild_id: guild,
        channel_id: hub,
        member: { user: { id: 'bot1', bot: true, username: 'Lyra' } },
      },
      hubChannelId: hub,
      guildId: guild,
      store: emptyTempVoiceStore(),
      previousChannelId: null,
    })
    expect(plan.type).toBe('ignore')
  })

  it('ignores other channels without empty temp', () => {
    const plan = planTempVoiceEvent({
      vs: vs({ user_id: owner, channel_id: 'general-voice' }),
      hubChannelId: hub,
      guildId: guild,
      store: emptyTempVoiceStore(),
      previousChannelId: null,
    })
    expect(plan.type).toBe('ignore')
  })

  it('cleans up empty owned room after leave', () => {
    const store: TempVoiceStore = {
      channels: { room9: { ownerId: owner, createdAt: 1, name: '🔊 alice' } },
      occupancy: {}, // already applied empty
    }
    const plan = planTempVoiceEvent({
      vs: vs({ user_id: owner, channel_id: null }),
      hubChannelId: hub,
      guildId: guild,
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
      vs: vs({ user_id: owner, channel_id: null }),
      hubChannelId: hub,
      guildId: guild,
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
      vs: vs({ user_id: owner, channel_id: hub }),
      hubChannelId: hub,
      guildId: guild,
      store,
      previousChannelId: null,
    })
    expect(plan).toEqual({ type: 'ignore', reason: 'create_in_flight' })
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
  it('gives creator channel admin bits (manage channel, mute, move, roles)', () => {
    const MANAGE_CHANNELS = 1 << 4
    const MUTE = 1 << 22
    const DEAFEN = 1 << 23
    const MOVE = 1 << 24
    const MANAGE_ROLES = 1 << 28
    for (const bit of [MANAGE_CHANNELS, MUTE, DEAFEN, MOVE, MANAGE_ROLES]) {
      expect(OWNER_VOICE_ALLOW & bit).toBeTruthy()
    }
    // superset of member voice
    expect(OWNER_VOICE_ALLOW & MEMBER_VOICE_ALLOW).toBe(MEMBER_VOICE_ALLOW)
  })

  it('includes type=1 member overwrite for ownerId', () => {
    const ows = memberVoiceOverwrites({
      guildId: 'g1',
      memberRoleId: 'role_member',
      ownerId: 'user_owner',
    })
    const owner = ows.find((o) => o.id === 'user_owner')
    expect(owner).toBeDefined()
    expect(owner?.type).toBe(1)
    expect(owner?.allow).toBe(String(OWNER_VOICE_ALLOW))
    expect(owner?.deny).toBe('0')
  })
})
