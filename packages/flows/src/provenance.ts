/**
 * Kit provenance marks for the two server-owned authority artefacts.
 *
 * Conformity and provenance are different questions. `checkPlan` answers the first — does this
 * grant stay inside what the pinned registry declares mintable — and it cannot answer the second,
 * because `allowsInfer` has no registry counterpart: it comes from org policy facts. A grant that
 * copies the mintable set exactly and sets `allowsInfer: true` is conformant and forged.
 *
 * So provenance is recorded, not inferred: `mintCapabilityGrant` marks the grants it mints,
 * `createToolRegistry` marks the registries it builds, and `createRunSnapshot` — the only boundary
 * that turns authority into a sealed run — refuses anything unmarked. Marks live in module-private
 * `WeakSet`s: unforgeable from outside this package, never serialised, collected with the object.
 *
 * Deliberately NOT exported from the package barrel. A product that could mark its own objects
 * would be minting authority, which is exactly what AGENTS.md invariant 3 forbids.
 *
 * Not integrity: a mark proves the object came out of the kit constructor, not that the policy
 * facts fed to `mintCapabilityGrant` were true. Facts provenance stays app-owned (invariant 3).
 */

const mintedGrants = new WeakSet<object>()
const kitRegistries = new WeakSet<object>()

/** Record a grant as minted by the kit. Called by `mintCapabilityGrant` only. */
export function markMintedGrant<T extends object>(grant: T): T {
  mintedGrants.add(grant)
  return grant
}

/** True when this exact object came out of `mintCapabilityGrant`. */
export function isMintedGrant(grant: unknown): boolean {
  return typeof grant === 'object' && grant !== null && mintedGrants.has(grant)
}

/** Record a registry as built by the kit. Called by `createToolRegistry` only. */
export function markKitRegistry<T extends object>(registry: T): T {
  kitRegistries.add(registry)
  return registry
}

/** True when this exact object came out of `createToolRegistry`. */
export function isKitRegistry(registry: unknown): boolean {
  return typeof registry === 'object' && registry !== null && kitRegistries.has(registry)
}
