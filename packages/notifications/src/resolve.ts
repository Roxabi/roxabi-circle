import type {
  AccessFacts,
  DestinationFacts,
  ExternalDecision,
  OrganizationDestinationResolution,
  RegistryEntry,
  Rule,
  RuleSource,
  Selector,
  UserResolution,
  UserRule,
} from './types'
import {
  matchesSelector,
  snapshotRule,
  snapshotSelector,
  validRule,
  validSelector,
} from './validation'

type Level = 'deployment' | 'organization' | 'user'
type Selected = { rule: Rule; source: RuleSource; invalid: boolean }

function candidate(
  rule: Rule,
  level: Level,
  typeKey: string,
  type: RegistryEntry,
  channel: string,
  seen: Set<string>,
): (Selected & { rank: number }) | undefined {
  if (!rule || typeof rule !== 'object' || rule.channel !== channel) return undefined
  const selector = rule.selector
  if (validSelector(selector) && !matchesSelector(selector, typeKey, type.category))
    return undefined
  const safeSelector: Selector = validSelector(selector) ? selector : { kind: 'all' }
  const rank = safeSelector.kind === 'type' ? 2 : safeSelector.kind === 'category' ? 1 : 0
  const source: RuleSource = { level, selector: safeSelector }
  const identity =
    safeSelector.kind === 'all' ? 'all' : `${safeSelector.kind}:${safeSelector.value}`
  const invalid = !validRule(rule, level) || seen.has(identity)
  seen.add(identity)
  return { rule, source, invalid, rank }
}

function select(
  rules: readonly Rule[],
  level: Level,
  typeKey: string,
  type: RegistryEntry,
  channel: string,
): Selected | undefined {
  let selected: Selected | undefined
  let best = -1
  const seen = new Set<string>()
  for (const rule of rules) {
    const current = candidate(rule, level, typeKey, type, channel, seen)
    if (!current) continue
    if (current.invalid) return current
    if (current.rank > best) {
      selected = current
      best = current.rank
    }
  }
  return selected
}

export function resolveUserNotification(
  input: Readonly<{
    typeKey: string
    type: RegistryEntry
    access: AccessFacts
    deploymentRules: readonly Rule[]
    organizationRules: readonly Rule[]
    userRules: readonly UserRule[]
  }>,
): UserResolution {
  const { typeKey, type, access } = input
  if (!access.organizationActive) return { admitted: false, reason: 'organization_inactive' }
  if (!access.member) return { admitted: false, reason: 'not_member' }
  if (!access.moduleReadable) return { admitted: false, reason: 'module_denied' }
  const deploymentRules = input.deploymentRules.map(snapshotRule)
  const organizationRules = input.organizationRules.map(snapshotRule)
  const userRules = input.userRules.map(snapshotRule)
  const external: ExternalDecision[] = type.channels.map((channel) => {
    const deployment = select(deploymentRules, 'deployment', typeKey, type, channel)
    const organization = select(organizationRules, 'organization', typeKey, type, channel)
    const user = select(userRules, 'user', typeKey, type, channel)
    const invalid = [deployment, organization, user].find((item) => item?.invalid)
    if (invalid) return { channel, enabled: false, locked: false, source: invalid.source }
    const chosen = deployment?.rule.locked
      ? deployment
      : organization?.rule.locked
        ? organization
        : (user ?? organization ?? deployment)
    return chosen
      ? { channel, enabled: chosen.rule.enabled, locked: chosen.rule.locked, source: chosen.source }
      : {
          channel,
          enabled: type.defaultOn.includes(channel),
          locked: false,
          source: { level: 'type-default' },
        }
  })
  return { admitted: true, inbox: true, external }
}

export function resolveOrganizationDestination(
  input: Readonly<{
    typeKey: string
    type: RegistryEntry
    channel: string
    destination: DestinationFacts
    deploymentRules: readonly Rule[]
  }>,
): OrganizationDestinationResolution {
  const { typeKey, type, channel, destination } = input
  if (!destination.configured) return { enabled: false, reason: 'not_configured' }
  if (!type.organizationDestinations) return { enabled: false, reason: 'type_not_opted_in' }
  if (!destination.organizationActive) return { enabled: false, reason: 'organization_inactive' }
  if (!destination.moduleEffective) return { enabled: false, reason: 'module_denied' }
  if (!type.channels.includes(channel)) return { enabled: false, reason: 'channel_not_declared' }
  const selector = snapshotSelector(destination.selector)
  if (!(validSelector(selector) && matchesSelector(selector, typeKey, type.category)))
    return { enabled: false, reason: 'selector_mismatch' }
  const deploymentRules = input.deploymentRules.map(snapshotRule)
  const deployment = select(deploymentRules, 'deployment', typeKey, type, channel)
  if (deployment?.invalid) return { enabled: false, reason: 'invalid_rule' }
  if (deployment?.rule.locked && !deployment.rule.enabled)
    return { enabled: false, reason: 'deployment_locked_off' }
  return { enabled: true, reason: 'enabled' }
}
