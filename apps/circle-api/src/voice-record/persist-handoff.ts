import { isVoiceRecordSpikeArmed } from './flag'
import {
  applyBotVoiceState,
  applyVoiceServerUpdate,
  emptyVoiceHandoff,
  VOICE_HANDOFF_KEY,
  type VoiceHandoff,
} from './handoff'

export async function loadVoiceHandoff(storage: DurableObjectStorage): Promise<VoiceHandoff> {
  const raw = await storage.get<VoiceHandoff>(VOICE_HANDOFF_KEY)
  if (!raw || typeof raw !== 'object') return emptyVoiceHandoff()
  return { ...emptyVoiceHandoff(), ...raw }
}

export async function saveVoiceHandoff(
  storage: DurableObjectStorage,
  handoff: VoiceHandoff,
): Promise<void> {
  await storage.put(VOICE_HANDOFF_KEY, handoff)
}

export async function captureVoiceServerUpdate(
  env: { VOICE_RECORD_SPIKE_A?: string },
  storage: DurableObjectStorage,
  d: unknown,
): Promise<void> {
  if (!isVoiceRecordSpikeArmed(env)) return
  const rec = d as { token?: string; endpoint?: string; guild_id?: string }
  if (!rec.endpoint && !rec.token) return
  const prev = await loadVoiceHandoff(storage)
  await saveVoiceHandoff(storage, applyVoiceServerUpdate(prev, rec))
}

export async function captureBotVoiceState(
  env: { VOICE_RECORD_SPIKE_A?: string },
  storage: DurableObjectStorage,
  botUserId: string | null,
  vs: {
    user_id?: string
    session_id?: string
    channel_id?: string | null
    guild_id?: string | null
  },
): Promise<void> {
  if (!isVoiceRecordSpikeArmed(env)) return
  if (!botUserId || vs.user_id !== botUserId) return
  const prev = await loadVoiceHandoff(storage)
  await saveVoiceHandoff(storage, applyBotVoiceState(prev, vs))
}
