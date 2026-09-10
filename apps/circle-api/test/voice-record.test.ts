import { describe, expect, it } from 'vitest'
import { emptyTempVoiceStore, planTempVoiceEvent } from '../src/discord/temp-voice'
import type { Env } from '../src/types'
import { isVoiceRecordSpikeArmed } from '../src/voice-record/flag'
import { buildVoiceStateUpdateOp, isDiscordGatewayUrl } from '../src/voice-record/gateway-voice'
import {
  applyBotVoiceState,
  applyVoiceServerUpdate,
  emptyVoiceHandoff,
  handoffPublicView,
  handoffReady,
} from '../src/voice-record/handoff'
import { isSnowflake, isVoiceSessionId, newVoiceSessionId } from '../src/voice-record/ids'
import {
  assertGuildMatches,
  assertNotVoiceHub,
  parseVoiceRecordStart,
  parseVoiceRecordStop,
} from '../src/voice-record/payload'
import { voiceManifestKey, voiceTrackKey, voiceUdpProbeKey } from '../src/voice-record/r2-keys'
import { startBodyForRecorder } from '../src/voice-record/recorder-client'
import { handleVoiceRecordRoute } from '../src/voice-record/routes'

const SECRET = 'ops-test-secret'
const GUILD = '1534225455144636526'
const CHANNEL = '1534225455144636527'
const HUB = '1534225455144636528'

function env(partial: Partial<Env> = {}): Env {
  return {
    ENVIRONMENT: 'test',
    SCORER_VERSION: '0',
    ACCEPT_THRESHOLD: '65',
    DISCORD_PUBLIC_KEY: 'x',
    DISCORD_BOT_TOKEN: 'bot',
    DISCORD_APPLICATION_ID: '1',
    DISCORD_GUILD_ID: GUILD,
    DISCORD_MEMBER_ROLE_ID: '2',
    DISCORD_APPEAL_CATEGORY_ID: '3',
    DISCORD_GITHUB_WATCH_CHANNEL_ID: '4',
    DISCORD_VOICE_HUB_CHANNEL_ID: HUB,
    GATEWAY_OPS_SECRET: SECRET,
    ...partial,
  } as Env
}

async function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
  e: Env = env({ VOICE_RECORD_SPIKE_A: '1' }),
): Promise<Response> {
  const res = await handleVoiceRecordRoute(
    new Request(`https://circle.example${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
    e,
    path,
  )
  if (!res) throw new Error(`expected voice-record route for ${path}`)
  return res
}

describe('isVoiceRecordSpikeArmed', () => {
  it('is off unless 1 or true', () => {
    expect(isVoiceRecordSpikeArmed({})).toBe(false)
    expect(isVoiceRecordSpikeArmed({ VOICE_RECORD_SPIKE_A: '' })).toBe(false)
    expect(isVoiceRecordSpikeArmed({ VOICE_RECORD_SPIKE_A: '0' })).toBe(false)
    expect(isVoiceRecordSpikeArmed({ VOICE_RECORD_SPIKE_A: '1' })).toBe(true)
    expect(isVoiceRecordSpikeArmed({ VOICE_RECORD_SPIKE_A: 'true' })).toBe(true)
  })
})

describe('voice-record ids + payload', () => {
  it('validates snowflakes and session ids', () => {
    expect(isSnowflake(GUILD)).toBe(true)
    expect(isSnowflake('abc')).toBe(false)
    const id = newVoiceSessionId(1_700_000_000_000, () => 0.5)
    expect(isVoiceSessionId(id)).toBe(true)
    expect(isVoiceSessionId('nope')).toBe(false)
  })

  it('parses start/stop and rejects hub + guild mismatch', () => {
    const start = parseVoiceRecordStart(
      { guildId: GUILD, channelId: CHANNEL },
      { generateSessionId: () => 'vr_a_b' },
    )
    expect(start).toEqual({
      ok: true,
      value: { guildId: GUILD, channelId: CHANNEL, sessionId: 'vr_a_b' },
    })
    expect(parseVoiceRecordStart({}).ok).toBe(false)
    expect(parseVoiceRecordStop({ sessionId: 'vr_a_b' }).ok).toBe(true)
    expect(parseVoiceRecordStop({}).ok).toBe(false)
    expect(assertNotVoiceHub(HUB, HUB).ok).toBe(false)
    expect(assertNotVoiceHub(CHANNEL, HUB).ok).toBe(true)
    expect(assertGuildMatches('9'.repeat(18), GUILD).ok).toBe(false)
    expect(assertGuildMatches(GUILD, GUILD).ok).toBe(true)
  })
})

describe('R2 key layout', () => {
  it('nests guild / utc day / session', () => {
    const input = { guildId: GUILD, sessionId: 'vr_a_b', startedAt: '2026-09-10T12:00:00.000Z' }
    expect(voiceManifestKey(input)).toBe(
      `voice-recordings/${GUILD}/2026-09-10/vr_a_b/manifest.json`,
    )
    expect(voiceTrackKey(input, '99')).toBe(
      `voice-recordings/${GUILD}/2026-09-10/vr_a_b/tracks/99.pcm`,
    )
    expect(voiceUdpProbeKey(input)).toContain('/udp-probe.json')
  })
})

describe('Opcode 4 + handoff', () => {
  it('builds mute-but-not-deaf Voice State Update', () => {
    const op = buildVoiceStateUpdateOp({ guildId: GUILD, channelId: CHANNEL })
    expect(op.op).toBe(4)
    expect(op.d.self_mute).toBe(true)
    expect(op.d.self_deaf).toBe(false)
    expect(op.d.channel_id).toBe(CHANNEL)
    expect(isDiscordGatewayUrl('wss://gateway.discord.gg/?v=10')).toBe(true)
    expect(isDiscordGatewayUrl('wss://us-east.discord.media')).toBe(false)
  })

  it('becomes ready only with endpoint + voice token + session + user', () => {
    let h = emptyVoiceHandoff()
    expect(handoffReady(h)).toBe(false)
    h = applyVoiceServerUpdate(h, { guild_id: GUILD, endpoint: 'eu.discord.media:80', token: 'vt' })
    h = applyBotVoiceState(h, {
      guild_id: GUILD,
      channel_id: CHANNEL,
      session_id: 'sess',
      user_id: 'bot-1',
    })
    expect(handoffReady(h)).toBe(true)
    const pub = handoffPublicView(h)
    expect(pub.hasToken).toBe(true)
    expect(pub).not.toHaveProperty('token')
    const body = startBodyForRecorder(
      { guildId: GUILD, channelId: CHANNEL, sessionId: 'vr_a_b' },
      h,
    )
    expect((body.voice as { token: string }).token).toBe('vt')
  })
})

describe('temp-voice vs recorder bot', () => {
  it('still ignores Lyra joining a temp room (no spawn)', () => {
    const plan = planTempVoiceEvent({
      vs: {
        user_id: 'bot-1',
        guild_id: GUILD,
        channel_id: CHANNEL,
        member: { user: { bot: true } },
      },
      hubChannelId: HUB,
      guildId: GUILD,
      botUserId: 'bot-1',
      store: emptyTempVoiceStore(),
      previousChannelId: null,
    })
    expect(plan.type).toBe('ignore')
  })
})

describe('POST /internal/voice-record/*', () => {
  it('404 when spike flag is off — even with a valid secret', async () => {
    const res = await post(
      '/internal/voice-record/start',
      { guildId: GUILD, channelId: CHANNEL },
      { 'X-Ops-Secret': SECRET },
      env(),
    )
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })

  it('401 when armed but secret missing or wrong', async () => {
    const miss = await post('/internal/voice-record/start', { guildId: GUILD, channelId: CHANNEL })
    expect(miss.status).toBe(401)
    const bad = await post(
      '/internal/voice-record/start',
      { guildId: GUILD, channelId: CHANNEL },
      { 'X-Ops-Secret': 'nope' },
    )
    expect(bad.status).toBe(401)
  })

  it('400 on bad payload / hub channel / other guild', async () => {
    const headers = { 'X-Ops-Secret': SECRET }
    expect((await post('/internal/voice-record/start', { guildId: 'x' }, headers)).status).toBe(400)
    expect(
      (await post('/internal/voice-record/start', { guildId: GUILD, channelId: HUB }, headers))
        .status,
    ).toBe(400)
    expect(
      (
        await post(
          '/internal/voice-record/start',
          { guildId: '9'.repeat(18), channelId: CHANNEL },
          headers,
        )
      ).status,
    ).toBe(400)
    expect((await post('/internal/voice-record/stop', {}, headers)).status).toBe(400)
  })

  it('503 recorder_not_configured when armed, authed, valid, no binding', async () => {
    const res = await post(
      '/internal/voice-record/start',
      { guildId: GUILD, channelId: CHANNEL, sessionId: 'vr_test_aa' },
      { 'X-Ops-Secret': SECRET },
    )
    expect(res.status).toBe(503)
    const json = (await res.json()) as { error: string; sessionId: string }
    expect(json.error).toBe('recorder_not_configured')
    expect(json.sessionId).toBe('vr_test_aa')
  })

  it('returns null for unrelated paths so /health and Gateway stay untouched', async () => {
    const res = await handleVoiceRecordRoute(
      new Request('https://circle.example/health'),
      env({ VOICE_RECORD_SPIKE_A: '1' }),
      '/health',
    )
    expect(res).toBeNull()
  })
})
