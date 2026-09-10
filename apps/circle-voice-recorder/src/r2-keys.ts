export const VOICE_R2_PREFIX = 'voice-recordings'

export function utcDay(isoOrMs: string | number): string {
  const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs)
  if (Number.isNaN(d.getTime())) return 'unknown-day'
  return d.toISOString().slice(0, 10)
}

export function voiceRecordingPrefix(input: {
  guildId: string
  sessionId: string
  startedAt: string | number
}): string {
  return `${VOICE_R2_PREFIX}/${input.guildId}/${utcDay(input.startedAt)}/${input.sessionId}`
}

export function voiceManifestKey(input: {
  guildId: string
  sessionId: string
  startedAt: string | number
}): string {
  return `${voiceRecordingPrefix(input)}/manifest.json`
}

export function voiceTrackKey(
  input: { guildId: string; sessionId: string; startedAt: string | number },
  userId: string,
  ext: 'pcm' | 'ogg' | 'json' = 'pcm',
): string {
  return `${voiceRecordingPrefix(input)}/tracks/${userId}.${ext}`
}

export function voiceUdpProbeKey(input: {
  guildId: string
  sessionId: string
  startedAt: string | number
}): string {
  return `${voiceRecordingPrefix(input)}/udp-probe.json`
}
