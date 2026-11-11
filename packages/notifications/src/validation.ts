import type { Registry, Rule, Selector } from './types'

export function validKey(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= max &&
    /^[a-z][a-z0-9._-]*$/.test(value) &&
    !/[\r\n\u2028\u2029]/.test(value)
  )
}

export function snapshotSelector(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const selector = value as Record<string, unknown>
  const kind = selector.kind
  if (kind === 'all' && !('value' in selector)) return { kind }
  return { kind, value: selector.value }
}

export function snapshotRule(rule: Rule): Rule {
  if (!rule || typeof rule !== 'object') return rule
  const { selector, channel, enabled, locked } = rule
  return { selector: snapshotSelector(selector) as Selector, channel, enabled, locked }
}

export function validSelector(value: unknown): value is Selector {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const selector = value as Record<string, unknown>
  if (selector.kind === 'all') return !('value' in selector)
  return (selector.kind === 'type' || selector.kind === 'category') && validKey(selector.value, 128)
}

export function matchesSelector(selector: Selector, typeKey: string, category: string): boolean {
  return (
    selector.kind === 'all' ||
    (selector.kind === 'type' ? selector.value === typeKey : selector.value === category)
  )
}

export function validRule(rule: Rule, level: 'deployment' | 'organization' | 'user'): boolean {
  return (
    !!rule &&
    typeof rule === 'object' &&
    validSelector(rule.selector) &&
    validKey(rule.channel, 64) &&
    rule.channel !== 'in_app' &&
    typeof rule.enabled === 'boolean' &&
    typeof rule.locked === 'boolean' &&
    !(level === 'user' && rule.locked) &&
    !(rule.channel === 'email' && rule.enabled && rule.locked)
  )
}

export function validateNotificationRule(
  input: Readonly<{
    registry: Registry
    level: 'deployment' | 'organization' | 'user'
    rule: Rule
  }>,
): Rule {
  const { registry, level, rule } = input
  const snapshot = snapshotRule(rule)
  if (!snapshot || typeof snapshot !== 'object') throw new TypeError('Invalid notification rule')
  const { selector, channel } = snapshot
  if (
    !(
      ['deployment', 'organization', 'user'].includes(level) &&
      validRule(snapshot, level) &&
      Object.entries(registry).some(
        ([key, type]) =>
          type.channels.includes(channel) && matchesSelector(selector, key, type.category),
      )
    )
  )
    throw new TypeError('Invalid notification rule')
  return Object.freeze({ ...snapshot, selector: Object.freeze(selector) })
}
