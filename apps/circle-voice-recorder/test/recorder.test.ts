import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isDiscordGatewayUrl } from '../src/gateway-guard'
import { handleRecorderRequest } from '../src/http'
import { voiceManifestKey } from '../src/r2-keys'
import { parseStartBody, parseStopBody, stopSession } from '../src/session'
import { probeUdp } from '../src/udp-probe'
import { createHandoffAdapterCreator } from '../src/voice-join'

const SECRET = 'rec-secret'

afterEach(() => {
  stopSession()
})

function env(dir: string) {
  return { GATEWAY_OPS_SECRET: SECRET, VOICE_RECORD_DUMP_DIR: dir }
}

async function post(path: string, body: unknown, dir: string, secret = SECRET): Promise<Response> {
  return handleRecorderRequest(
    new Request(`http://recorder.local${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Ops-Secret': secret },
      body: JSON.stringify(body),
    }),
    env(dir),
  )
}

describe('gateway guard', () => {
  it('blocks Gateway hosts and allows voice media', () => {
    expect(isDiscordGatewayUrl('wss://gateway.discord.gg/?v=10')).toBe(true)
    expect(isDiscordGatewayUrl('https://gateway.discord.com')).toBe(true)
    expect(isDiscordGatewayUrl('wss://eu-west.discord.media')).toBe(false)
  })
})

describe('session parse', () => {
  it('requires snowflakes + vr_ session id', () => {
    expect(parseStartBody({}).ok).toBe(false)
    const ok = parseStartBody({
      sessionId: 'vr_a_b',
      guildId: '1'.repeat(18),
      channelId: '2'.repeat(18),
      voice: { endpoint: 'eu.discord.media:80', token: 'vt', sessionId: 's', userId: 'u' },
    })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.voice?.endpoint).toBe('eu.discord.media:80')
    expect(parseStopBody({ sessionId: 'vr_a_b' }).ok).toBe(true)
  })
})

describe('handoff adapter', () => {
  it('injects server/state updates and never targets Gateway', () => {
    const events: string[] = []
    const creator = createHandoffAdapterCreator({
      guildId: '1'.repeat(18),
      channelId: '2'.repeat(18),
      voice: { endpoint: 'eu.discord.media:80', token: 'vt', sessionId: 's', userId: 'u' },
    }) as (m: {
      onVoiceServerUpdate: (d: Record<string, string>) => void
      onVoiceStateUpdate: (d: Record<string, string>) => void
    }) => { sendPayload: () => boolean }
    const adapter = creator({
      onVoiceServerUpdate: (d) => {
        events.push(`server:${d.endpoint}`)
      },
      onVoiceStateUpdate: (d) => {
        events.push(`state:${d.session_id}`)
      },
    })
    expect(adapter.sendPayload()).toBe(true)
    return new Promise<void>((resolve) => {
      queueMicrotask(() => {
        expect(events).toContain('server:eu.discord.media:80')
        expect(events).toContain('state:s')
        resolve()
      })
    })
  })
})

describe('HTTP control plane', () => {
  it('health is public; mutating routes need ops secret', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vr-'))
    const health = await handleRecorderRequest(
      new Request('http://recorder.local/health'),
      env(dir),
    )
    expect(health.status).toBe(200)
    const unauth = await handleRecorderRequest(
      new Request('http://recorder.local/start', { method: 'POST', body: '{}' }),
      env(dir),
    )
    expect(unauth.status).toBe(401)
  })

  it('start writes placeholder track + manifest; stop requires same session', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vr-'))
    const start = await post(
      '/start',
      { sessionId: 'vr_a_b', guildId: '1'.repeat(18), channelId: '2'.repeat(18) },
      dir,
    )
    expect(start.status).toBe(200)
    const started = (await start.json()) as { sessionId: string; join: { mode: string } }
    expect(started.sessionId).toBe('vr_a_b')
    expect(started.join.mode).toBe('placeholder')
    const files = await readdir(dir)
    expect(files.some((f) => f.includes('manifest'))).toBe(true)
    expect(
      voiceManifestKey({
        guildId: '1'.repeat(18),
        sessionId: 'vr_a_b',
        startedAt: '2026-09-10T00:00:00.000Z',
      }),
    ).toContain('voice-recordings')

    const wrong = await post('/stop', { sessionId: 'vr_other_xx' }, dir)
    expect(wrong.status).toBe(404)
    const stop = await post('/stop', { sessionId: 'vr_a_b' }, dir)
    expect(stop.status).toBe(200)
  })
})

describe('udp probe shape', () => {
  it('returns a structured result even on timeout', async () => {
    const r = await probeUdp({ host: '127.0.0.1', port: 1, timeoutMs: 40 })
    expect(r.host).toBe('127.0.0.1')
    expect(r.port).toBe(1)
    expect(typeof r.elapsedMs).toBe('number')
    expect(r.ok === true || typeof r.error === 'string').toBe(true)
  })
})
