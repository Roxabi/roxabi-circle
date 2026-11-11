import { COMMENTS_MODULE_ID } from '@kit/comments'
import { FLOWS_MODULE_ID } from '@kit/flows'
import { TASKS_MODULE_ID } from '@kit/tasks'

/** Known kit module ids — extend when adding optional surfaces (product-specific elsewhere). */
export const KIT_MODULE_IDS = [
  'demo',
  FLOWS_MODULE_ID,
  TASKS_MODULE_ID,
  COMMENTS_MODULE_ID,
] as const

export type KitModuleId = (typeof KIT_MODULE_IDS)[number]

export function isKitModuleId(id: string): id is KitModuleId {
  return (KIT_MODULE_IDS as readonly string[]).includes(id)
}

/** Registry of optional kit modules — disabled until admin enables (except dogfood seed). */
export const KIT_MODULE_DEFAULTS: ReadonlyArray<{ id: KitModuleId }> = [
  { id: 'demo' },
  { id: FLOWS_MODULE_ID },
  { id: TASKS_MODULE_ID },
  { id: COMMENTS_MODULE_ID },
]
