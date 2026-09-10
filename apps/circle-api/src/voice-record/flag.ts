/** Spike A is off unless the operator explicitly sets VOICE_RECORD_SPIKE_A=1. */
export function isVoiceRecordSpikeArmed(
  env: { VOICE_RECORD_SPIKE_A?: string } | undefined,
): boolean {
  const raw = env?.VOICE_RECORD_SPIKE_A?.trim().toLowerCase()
  return raw === '1' || raw === 'true'
}
