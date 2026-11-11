/** Deep-freeze for sealed run snapshots (mutable seal residual). */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (Object.isFrozen(value)) return value
  Object.freeze(value)
  if (value instanceof Map) {
    for (const [k, v] of value.entries()) {
      deepFreeze(k)
      deepFreeze(v)
    }
    return value
  }
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item)
    return value
  }
  for (const v of Object.values(value as Record<string, unknown>)) {
    deepFreeze(v)
  }
  return value
}
