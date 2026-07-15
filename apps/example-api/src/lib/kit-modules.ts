/** Known kit module ids — extend when adding optional surfaces. */
export const KIT_MODULE_IDS = ['feedback'] as const

export type KitModuleId = (typeof KIT_MODULE_IDS)[number]

export function isKitModuleId(id: string): id is KitModuleId {
  return (KIT_MODULE_IDS as readonly string[]).includes(id)
}

/** Registry of optional kit modules — disabled until admin configures + enables. */
export const KIT_MODULE_DEFAULTS: ReadonlyArray<{ id: KitModuleId }> = [{ id: 'feedback' }]
