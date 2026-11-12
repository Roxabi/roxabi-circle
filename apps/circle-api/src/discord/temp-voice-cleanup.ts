import type { TempVoicePlan, TempVoiceStore } from './temp-voice'

export function planVoiceCleanup(
  store: TempVoiceStore,
  left: string | null,
  joined: string | null,
): TempVoicePlan {
  if (store.occupancyTrusted === false) {
    return { type: 'ignore', reason: 'occupancy_untrusted' }
  }

  const emptyTracked: string[] = []
  for (const channelId of Object.keys(store.channels)) {
    if (channelId === left || channelId === joined) {
      if ((store.occupancy[channelId] ?? []).length === 0) emptyTracked.push(channelId)
    }
  }
  if (left && store.channels[left] && (store.occupancy[left] ?? []).length === 0) {
    if (!emptyTracked.includes(left)) emptyTracked.push(left)
  }
  if (emptyTracked.length) return { type: 'cleanup', channelIds: emptyTracked }
  return { type: 'ignore', reason: 'no_op' }
}
