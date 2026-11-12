/**
 * bun.lock (text, lockfileVersion 1) → resolved package instances, and the diff between two locks.
 *
 * Shapes (Bun 1.4.0, see the observed lock and Bun's lockfile writer):
 *   registry   "name": ["name@1.2.3", "", { deps… }, "sha512-…"]   2nd element "" = default registry
 *   custom reg "name": ["name@1.2.3", "https://reg.example", { … }, "sha512-…"]
 *   alias      "alias": ["alias@npm:target@1.2.3", "", { … }, "sha512-…"]
 *   workspace  "@kit/core": ["@kit/core@workspace:packages/core"]   (skipped: first-party)
 *   git/github/tarball/file/link: every other `name@<non-semver spec>` — never a plain registry package.
 * Anything not recognised is reported as `nonRegistry`, never skipped: an unreadable shape is a finding.
 */
import { at } from './json.ts'
import type { LockPackage } from './types.ts'

const SEMVER =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

export class LockParseError extends Error {}

function toPackage(key: string, entry: unknown): LockPackage | undefined {
  if (!Array.isArray(entry) || typeof entry[0] !== 'string') {
    throw new LockParseError(`bun.lock packages["${key}"]: not an array starting with "name@spec"`)
  }
  const id = entry[0]
  const at = id.indexOf('@', 1)
  if (at < 0) throw new LockParseError(`bun.lock packages["${key}"]: id "${id}" has no @spec`)
  let name = id.slice(0, at)
  let spec = id.slice(at + 1)
  if (spec.startsWith('workspace:')) return undefined
  const last = entry[entry.length - 1]
  const integrity = typeof last === 'string' && last.startsWith('sha') ? last : undefined

  if (spec.startsWith('npm:')) {
    // alias: the real package is the target; the version is what follows its last '@'.
    const target = spec.slice('npm:'.length)
    const tAt = target.lastIndexOf('@')
    if (tAt <= 0)
      return { key, name, version: spec, nonRegistry: `unreadable npm alias "${id}"`, integrity }
    name = target.slice(0, tAt)
    spec = target.slice(tAt + 1)
  }
  if (!SEMVER.test(spec)) {
    return {
      key,
      name,
      version: spec,
      nonRegistry: `resolved from "${spec}", not the npm registry`,
      integrity,
    }
  }
  const registry = entry[1]
  if (registry !== '') {
    return {
      key,
      name,
      version: spec,
      nonRegistry: `non-default registry ${JSON.stringify(registry)}`,
      integrity,
    }
  }
  return { key, name, version: spec, nonRegistry: undefined, integrity }
}

export function parseLock(text: string): LockPackage[] {
  let parsed: unknown
  try {
    parsed = Bun.JSONC.parse(text)
  } catch (e) {
    throw new LockParseError(`bun.lock is not valid JSONC: ${(e as Error).message}`)
  }
  const packages = at(parsed, 'packages')
  if (packages === null || typeof packages !== 'object' || Array.isArray(packages)) {
    throw new LockParseError('bun.lock has no `packages` mapping')
  }
  const out: LockPackage[] = []
  for (const [key, entry] of Object.entries(packages)) {
    const pkg = toPackage(key, entry)
    if (pkg) out.push(pkg)
  }
  return out
}

export type LockChange = {
  head: LockPackage
  /** Closest earlier version of the same name in the base lock; undefined = newly added package. */
  previous: LockPackage | undefined
}

/**
 * Every head instance whose name@version is not in the base lock (bumped or added, direct or
 * transitive), plus every instance that kept name@version but changed integrity.
 */
export function diffLocks(base: readonly LockPackage[], head: readonly LockPackage[]) {
  const baseByName = new Map<string, LockPackage[]>()
  for (const p of base) baseByName.set(p.name, [...(baseByName.get(p.name) ?? []), p])
  const baseExact = new Map(base.map((p) => [`${p.name}@${p.version}`, p]))

  const changes: LockChange[] = []
  const integrityChanged: { head: LockPackage; base: LockPackage }[] = []
  const seen = new Set<string>()
  for (const p of head) {
    const id = `${p.name}@${p.version}`
    const same = baseExact.get(id)
    if (same) {
      if (same.integrity !== p.integrity && !seen.has(`i:${id}`)) {
        seen.add(`i:${id}`)
        integrityChanged.push({ head: p, base: same })
      }
      continue
    }
    if (seen.has(id)) continue
    seen.add(id)
    const earlier = (baseByName.get(p.name) ?? []).filter((b) => !b.nonRegistry)
    // Closest version below the new one; failing that, the highest known.
    const below = earlier.filter((b) => Bun.semver.order(b.version, p.version) < 0)
    const pool = below.length > 0 ? below : earlier
    const previous = pool.sort((a, b) => Bun.semver.order(a.version, b.version)).at(-1)
    changes.push({ head: p, previous })
  }
  return { changes, integrityChanged }
}
