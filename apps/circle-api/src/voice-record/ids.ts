/** Discord snowflake: 17–20 decimal digits. */
const SNOWFLAKE = /^\d{17,20}$/

export function isSnowflake(value: unknown): value is string {
  return typeof value === 'string' && SNOWFLAKE.test(value)
}

export function newVoiceSessionId(now = Date.now(), rand = Math.random): string {
  const suffix = Math.floor(rand() * 1e9)
    .toString(36)
    .padStart(6, '0')
  return `vr_${now.toString(36)}_${suffix}`
}

export function isVoiceSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^vr_[a-z0-9]+_[a-z0-9]+$/.test(value) && value.length <= 64
}
