import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { voiceManifestKey, voiceTrackKey, voiceUdpProbeKey } from './r2-keys'

export type DumpEnv = {
  VOICE_RECORD_DUMP_DIR?: string
  R2_HTTP_PUT_PREFIX?: string
  GATEWAY_OPS_SECRET?: string
}

export type SessionMeta = {
  sessionId: string
  guildId: string
  channelId: string
  startedAt: string
}

function dumpDir(env: DumpEnv): string {
  return env.VOICE_RECORD_DUMP_DIR ?? '/tmp/voice-record-spike-a'
}

function localPath(env: DumpEnv, key: string): string {
  return join(dumpDir(env), key.replaceAll('/', '__'))
}

async function putObject(env: DumpEnv, key: string, body: Uint8Array | string): Promise<boolean> {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
  const dest = localPath(env, key)
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, bytes)
  const prefix = env.R2_HTTP_PUT_PREFIX?.replace(/\/$/, '')
  if (!prefix) return false
  const res = await fetch(`${prefix}/${key}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      ...(env.GATEWAY_OPS_SECRET ? { 'X-Ops-Secret': env.GATEWAY_OPS_SECRET } : {}),
    },
    body: bytes,
  })
  return res.ok
}

export async function dumpPlaceholderTrack(
  env: DumpEnv,
  meta: SessionMeta,
  userId: string,
): Promise<{ key: string; uploaded: boolean }> {
  const key = voiceTrackKey(meta, userId, 'pcm')
  // 20 ms of silence s16le 48 kHz mono — proves the write path without live RTP.
  const uploaded = await putObject(env, key, new Uint8Array(48_000 * 2 * 0.02))
  return { key, uploaded }
}

export async function dumpManifest(
  env: DumpEnv,
  meta: SessionMeta,
  tracks: Array<{ userId: string; key: string }>,
  extra?: Record<string, unknown>,
): Promise<{ key: string; uploaded: boolean }> {
  const key = voiceManifestKey(meta)
  const uploaded = await putObject(
    env,
    key,
    JSON.stringify({
      schema: 'circle-voice-spike-a/v1',
      ...meta,
      stoppedAt: extra?.stoppedAt ?? null,
      tracks,
      ...extra,
    }),
  )
  return { key, uploaded }
}

export async function dumpUdpProbe(
  env: DumpEnv,
  meta: SessionMeta,
  probe: unknown,
): Promise<{ key: string; uploaded: boolean }> {
  const key = voiceUdpProbeKey(meta)
  const uploaded = await putObject(env, key, JSON.stringify(probe))
  return { key, uploaded }
}
