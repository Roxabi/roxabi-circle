/**
 * npm registry client of the guard. One full packument per package name (it is the only registry
 * document carrying both per-version `_npmUser` / `dist.attestations` / `scripts` AND the `time`
 * map), cached for the run. The bulk advisory endpoint is the one `bun audit` uses; it answers every
 * advisory matching any queried version, and matching a version to a range is the caller's job.
 * `fetch` is injected so the self-test runs with no network.
 */
import { at, str } from './json.ts'
import { type Advisory, INSTALL_SCRIPTS, type Registry, type VersionMeta } from './types.ts'

type Packument = {
  repository?: unknown
  time?: Record<string, string>
  versions?: Record<string, PackumentVersion>
}
type PackumentVersion = {
  repository?: unknown
  _npmUser?: { name?: string; trustedPublisher?: { oidcConfigId?: string } }
  dist?: { attestations?: unknown }
  scripts?: Record<string, unknown>
}

/** `github.com/<owner>/<repo>`-style identity of a repository URL (`git+https://…/x.git`, `git@host:o/r`,
 *  `github:o/r`, `o/r`, `ssh://git@host/o/r`); lowercase, no scheme/credentials/`.git`/trailing slash. */
function normalizeRepo(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  let u = raw.trim().replace(/^git\+/, '')
  const shorthand = u.match(/^(github|gitlab|bitbucket):(.+)$/)
  if (shorthand)
    u = `${shorthand[1]}.${shorthand[1] === 'bitbucket' ? 'org' : 'com'}/${shorthand[2]}`
  else if (/^[\w.-]+\/[\w.-]+$/.test(u)) u = `github.com/${u}`
  u = u
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^[^@/]+@/, '')
    .replace(/^([^/:]+):(?!\d+\/)/, '$1/')
  u = u
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
    .toLowerCase()
  return /^[^/]+\/[^/]+\/[^/]+/.test(u) ? u : undefined
}

/** `repository` is a `{ url }` object or a bare string in package.json. */
function repoUrl(repository: unknown): string | undefined {
  return typeof repository === 'string' ? repository : str(repository, 'url')
}

/** Source repository an npm provenance attestation (SLSA v1 predicate) names, from the
 *  `/-/npm/v1/attestations/<pkg>@<version>` document. */
function repoFromAttestations(doc: unknown): string | undefined {
  const list = at(doc, 'attestations')
  if (!Array.isArray(list)) return undefined
  for (const a of list) {
    if (str(a, 'predicateType') !== 'https://slsa.dev/provenance/v1') continue
    const payload = str(a, 'bundle', 'dsseEnvelope', 'payload')
    if (!payload) continue
    try {
      const statement: unknown = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
      return normalizeRepo(
        str(
          statement,
          'predicate',
          'buildDefinition',
          'externalParameters',
          'workflow',
          'repository',
        ),
      )
    } catch {
      return undefined
    }
  }
  return undefined
}

/** Pure projection of one version out of a registry packument (recorded fixtures test this). */
function metaFromPackument(doc: Packument, version: string): VersionMeta | undefined {
  const v = doc.versions?.[version]
  if (!v) return undefined
  const installScripts: Record<string, string> = {}
  for (const name of INSTALL_SCRIPTS) {
    const cmd = v.scripts?.[name]
    if (typeof cmd === 'string' && cmd.length > 0) installScripts[name] = cmd
  }
  return {
    published: doc.time?.[version],
    publisher: v._npmUser?.name,
    // npm spells the same config `oidc:<uuid>` on some versions and `<uuid>` on others (hono 4.13.9 vs 4.13.12).
    oidcConfig: v._npmUser?.trustedPublisher?.oidcConfigId?.replace(/^oidc:/, ''),
    attested: Boolean(v.dist?.attestations),
    repository: normalizeRepo(repoUrl(v.repository) ?? repoUrl(doc.repository)),
    installScripts,
  }
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

type Options = {
  fetchFn?: FetchFn
  baseUrl?: string
  concurrency?: number
  retries?: number
  backoffMs?: number
}

export function createNpmRegistry(options: Options = {}): Registry {
  const fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init))
  const baseUrl = options.baseUrl ?? 'https://registry.npmjs.org'
  const retries = options.retries ?? 4
  const backoffMs = options.backoffMs ?? 400
  let active = 0
  const waiting: (() => void)[] = []
  const limit = options.concurrency ?? 6
  const packuments = new Map<string, Promise<Packument | undefined>>()

  async function slot<T>(fn: () => Promise<T>): Promise<T> {
    while (active >= limit) await new Promise<void>((r) => waiting.push(r))
    active++
    try {
      return await fn()
    } finally {
      active--
      waiting.shift()?.()
    }
  }

  /** One attempt: a response to return, `undefined` for 404, or a `retry`/`fatal` outcome. */
  async function attempt(url: string, init?: RequestInit) {
    try {
      const res = await slot(() => fetchFn(url, { ...init, signal: AbortSignal.timeout(120_000) }))
      if (res.status === 404) return { done: true as const, res: undefined, last: '' }
      if (res.ok) return { done: true as const, res, last: '' }
      const retryable = res.status === 429 || res.status >= 500
      return { done: false as const, retry: retryable, last: `HTTP ${res.status}` }
    } catch (e) {
      return { done: false as const, retry: true, last: (e as Error).message }
    }
  }

  /** Retries network errors / 429 / 5xx. 404 → undefined. Anything else is an error. */
  async function request(url: string, init?: RequestInit): Promise<Response | undefined> {
    let last = ''
    for (let n = 0; n <= retries; n++) {
      if (n > 0) await Bun.sleep(backoffMs * n)
      const out = await attempt(url, init)
      if (out.done) return out.res
      last = out.last
      if (!out.retry) break
    }
    throw new Error(`registry request failed (${last}): ${url}`)
  }

  function packument(name: string): Promise<Packument | undefined> {
    let p = packuments.get(name)
    if (!p) {
      p = request(`${baseUrl}/${name.replace('/', '%2F')}`).then(
        (r) => r?.json() as Promise<Packument>,
      )
      packuments.set(name, p)
    }
    return p
  }

  return {
    async version(name, version) {
      const doc = await packument(name)
      return doc ? metaFromPackument(doc, version) : undefined
    },

    async provenance(name, version) {
      const url = `${baseUrl}/-/npm/v1/attestations/${encodeURIComponent(name)}@${version}`
      let res: Response | undefined
      try {
        res = await request(url)
      } catch (e) {
        return { repo: undefined, why: `attestation fetch failed (${(e as Error).message})` }
      }
      if (!res) return { repo: undefined, why: 'the registry has no attestation document' }
      const repo = repoFromAttestations(await res.json().catch(() => undefined))
      return repo
        ? { repo, why: undefined }
        : { repo: undefined, why: 'no SLSA provenance source repository in the attestation' }
    },

    async advisories(pkgs) {
      const out = new Map<string, Advisory[]>()
      if (pkgs.size === 0) return out
      const body = Object.fromEntries([...pkgs].map(([name, versions]) => [name, [...versions]]))
      const res = await request(`${baseUrl}/-/npm/v1/security/advisories/bulk`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res) throw new Error('registry bulk advisory endpoint answered 404')
      const raw = (await res.json()) as Record<
        string,
        {
          id: number | string
          url: string
          title: string
          severity: string
          vulnerable_versions: string
        }[]
      >
      for (const [name, list] of Object.entries(raw)) {
        out.set(
          name,
          list.map((a) => ({
            id: String(a.id),
            url: a.url,
            title: a.title,
            severity: a.severity,
            range: a.vulnerable_versions,
          })),
        )
      }
      return out
    },
  }
}
