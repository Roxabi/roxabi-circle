#!/usr/bin/env bun
/**
 * Collect GitHub ProfileSignals (incl. org + external contribs), score, save JSON.
 *
 * v0.4 collector — specialty model (craft | ecosystem).
 * - technical vs doc/profile repos for craft path
 * - orgs strict (v0.3 rules)
 * - scores via scoreProfile() SSoT (no dual formula)
 *
 * Usage: bun scripts/collect-github-profiles.mjs [login...]
 */
import { writeFileSync, mkdirSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { scoreProfile } from "../apps/circle-api/src/scoring/score.ts"

const ROOT = resolve(import.meta.dir, "..")
const OUT = resolve(ROOT, "docs/product/profiles")
const USERS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["hoklims", "MonsieurBarti", "MickaelV0"]

/** Min public PushEvents on Org/* to count an event-discovered org */
const MIN_ORG_PUSHES = 3
/** Cap crude size→additions fallback (anti-inflation) */
const VOLUME_FALLBACK_CAP = 50_000
const COLLECTOR_VERSION = "0.4.0-specialty"

/** Profile / meta repos that are not technical craft */
function isDocOrProfileRepo(r, login) {
  const name = (r.name || "").toLowerCase()
  const full = (r.full_name || "").toLowerCase()
  const desc = (r.description || "").toLowerCase()
  if (name === login.toLowerCase()) return true
  if (name === ".github") return true
  if (name.endsWith(".github.io") && (r.size || 0) < 500) return true
  if (/profile|readme|portfolio|cv-resume|awesome-list/.test(name)) return true
  if (/^profile (readme|repository)/i.test(r.description || "")) return true
  if (desc.includes("profile readme") || desc.includes("github profile")) return true
  // empty-ish
  if ((r.size || 0) < 5 && !(r.language)) return true
  return false
}

const AI_KEYWORDS = [
  "ai",
  "llm",
  "llms",
  "gpt",
  "openai",
  "anthropic",
  "claude",
  "gemini",
  "ollama",
  "vllm",
  "langchain",
  "llamaindex",
  "rag",
  "embedding",
  "embeddings",
  "vector",
  "vectorstore",
  "transformer",
  "transformers",
  "machine-learning",
  "machinelearning",
  "deep-learning",
  "deeplearning",
  "neural",
  "agent",
  "agents",
  "agentic",
  "mcp",
  "model-context-protocol",
  "prompt",
  "prompts",
  "chatbot",
  "copilot",
  "inference",
  "fine-tune",
  "finetune",
  "finetuning",
  "huggingface",
  "hugging-face",
  "pytorch",
  "tensorflow",
  "diffusion",
  "stable-diffusion",
  "whisper",
  "tts",
  "stt",
  "nlp",
  "computer-vision",
  "harness",
  "workers",
  "cloudflare",
]

function keywordAffinity(texts, topics = []) {
  const haystack = [...texts, ...topics]
    .join(" ")
    .toLowerCase()
    .replace(/[_\-/]+/g, " ")
  let hits = 0
  for (const kw of AI_KEYWORDS) {
    const re = new RegExp(
      `(?:^|[^a-z0-9])${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`,
      "i",
    )
    if (re.test(haystack)) hits += 1
  }
  return Math.min(1, hits / 6)
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x))
}
function logNorm(v, ref) {
  if (v <= 0) return 0
  return clamp01(Math.log1p(v) / Math.log1p(ref))
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function gh(path, { allowFail = false } = {}) {
  try {
    const out = execFileSync("gh", ["api", path, "--paginate"], {
      encoding: "utf8",
      maxBuffer: 80 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    })
    const t = out.trim()
    if (!t) return null
    if (t.startsWith("[")) {
      try {
        return JSON.parse(t)
      } catch {
        const chunks = []
        let depth = 0
        let start = -1
        for (let i = 0; i < t.length; i++) {
          if (t[i] === "[") {
            if (depth === 0) start = i
            depth++
          } else if (t[i] === "]") {
            depth--
            if (depth === 0 && start >= 0) {
              chunks.push(JSON.parse(t.slice(start, i + 1)))
              start = -1
            }
          }
        }
        return chunks.flat()
      }
    }
    return JSON.parse(t)
  } catch (e) {
    if (allowFail) return null
    throw e
  }
}

function daysSince(iso) {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function structureFromTree(paths) {
  if (!paths.length) return 0.1
  const lower = paths.map((p) => p.toLowerCase())
  const has = (re) => lower.some((p) => re.test(p))
  let score = 0
  let checks = 0
  const check = (ok) => {
    checks++
    if (ok) score++
  }
  check(has(/^(src|lib|app|packages|apps)\//) || has(/\/(src|lib|app)\//))
  check(has(/^tests?\//) || has(/\.(test|spec)\.[jt]sx?$/) || has(/_test\./))
  check(has(/^\.github\/workflows\//) || has(/^\.gitlab-ci\.yml$/))
  check(has(/^readme\.md$/) || has(/^docs\//) || has(/\/adr\//))
  const n = paths.length
  check(n >= 10 && n <= 5000)
  const rootFiles = paths.filter((p) => !p.includes("/")).length
  check(rootFiles / Math.max(n, 1) < 0.5)
  const vendor = lower.filter(
    (p) =>
      p.includes("node_modules/") ||
      p.includes("/vendor/") ||
      p.startsWith("dist/") ||
      p.includes("/dist/"),
  ).length
  check(vendor / Math.max(n, 1) < 0.2)
  return score / checks
}

/** @mentions that look like org/user handles */
function extractAtHandles(...texts) {
  const set = new Set()
  for (const t of texts) {
    if (!t) continue
    for (const m of String(t).matchAll(/@([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)/g)) {
      set.add(m[1])
    }
  }
  return set
}

function collect(login) {
  console.error(`\n=== collecting ${login} (${COLLECTOR_VERSION}) ===`)
  const user = gh(`users/${login}`)
  const accountAgeDays = Math.floor(
    (Date.now() - new Date(user.created_at).getTime()) / 86400000,
  )

  // --- owned personal repos ---
  let ownedRepos = gh(`users/${login}/repos?type=owner&per_page=100&sort=pushed`) || []
  if (!Array.isArray(ownedRepos)) ownedRepos = []
  const owned = ownedRepos.filter((r) => !r.fork)
  const technicalOwned = owned.filter((r) => !isDocOrProfileRepo(r, login))
  const docOnlyOwned = owned.filter((r) => isDocOrProfileRepo(r, login))
  console.error(
    `  owned=${owned.length} technical=${technicalOwned.length} doc/profile=${docOnlyOwned.length}`,
  )

  let memberRepos = gh(`users/${login}/repos?type=member&per_page=100`, {
    allowFail: true,
  })
  if (!Array.isArray(memberRepos)) memberRepos = []

  // --- public events (rich org signal) ---
  let events = gh(`users/${login}/events/public?per_page=100`, { allowFail: true })
  if (!Array.isArray(events)) events = []
  // second page-ish: paginate already in gh --paginate

  /** @type {Map<string, { full_name: string, pushes: number, prs: number, lastAt: string }>} */
  const eventRepos = new Map()
  /** @type {Set<string>} */
  const eventOrgs = new Set()

  for (const e of events) {
    const full = e.repo?.name // owner/repo
    if (!full || !full.includes("/")) continue
    const [owner] = full.split("/")
    if (owner.toLowerCase() !== login.toLowerCase()) {
      eventOrgs.add(owner)
    }
    const cur = eventRepos.get(full) || {
      full_name: full,
      pushes: 0,
      prs: 0,
      lastAt: e.created_at,
    }
    if (e.type === "PushEvent") cur.pushes++
    if (e.type === "PullRequestEvent") cur.prs++
    if (new Date(e.created_at) > new Date(cur.lastAt)) cur.lastAt = e.created_at
    eventRepos.set(full, cur)
  }

  // --- orgs (strict): public memberships + verified @Org + event orgs with enough pushes ---
  /** @type {Map<string, number>} owner -> push count from events */
  const pushesByOwner = new Map()
  for (const [full, meta] of eventRepos) {
    const [owner] = full.split("/")
    if (owner.toLowerCase() === login.toLowerCase()) continue
    pushesByOwner.set(owner, (pushesByOwner.get(owner) || 0) + meta.pushes)
  }

  /** @type {Set<string>} */
  const verifiedOrgs = new Set()

  // 1) Public membership list (already filtered by GitHub)
  const publicOrgs = gh(`users/${login}/orgs`, { allowFail: true })
  if (Array.isArray(publicOrgs)) {
    for (const o of publicOrgs) if (o.login) verifiedOrgs.add(o.login)
  }

  // 2) company/bio @handles — only real Organizations
  for (const h of extractAtHandles(user.company, user.bio, user.blog)) {
    if (h.toLowerCase() === login.toLowerCase()) continue
    const org = gh(`orgs/${h}`, { allowFail: true })
    if (org?.login && org.type !== "User") verifiedOrgs.add(org.login)
  }

  // 3) event owners — must be Organization + enough pushes (anti noise: openai, random users)
  for (const [owner, pushes] of pushesByOwner) {
    if (pushes < MIN_ORG_PUSHES) continue
    const org = gh(`orgs/${owner}`, { allowFail: true })
    if (org?.login && org.type !== "User") verifiedOrgs.add(org.login)
  }

  const verifiedOrgList = [...verifiedOrgs]
  const publicOrgCount = verifiedOrgList.length

  // org maintainer intensity: total PushEvents on verified org repos
  let orgPushEvents = 0
  for (const [full, meta] of eventRepos) {
    const [owner] = full.split("/")
    if (verifiedOrgs.has(owner)) orgPushEvents += meta.pushes
  }
  console.error(
    `  orgs=[${verifiedOrgList.join(",")}] orgPushEvents=${orgPushEvents} eventOwners=${[...eventOrgs].join(",")}`,
  )

  // --- external merged PRs (author, repo not owned by user) ---
  let externalMergedPrs = 0
  let externalPrSample = []
  try {
    const q = encodeURIComponent(`is:pr is:merged author:${login}`)
    const search = gh(`search/issues?q=${q}&per_page=30`)
    const items = search?.items || []
    externalPrSample = items
    // repository_url like https://api.github.com/repos/Owner/repo
    for (const it of items) {
      const m = String(it.repository_url || "").match(/repos\/([^/]+)\//)
      const owner = m?.[1]
      if (owner && owner.toLowerCase() !== login.toLowerCase()) {
        externalMergedPrs++
      }
    }
    // if total_count higher, scale conservatively from sample ratio
    const total = search?.total_count || 0
    if (total > items.length && items.length > 0) {
      const ratio =
        externalMergedPrs / Math.max(1, items.filter((it) => {
          const m = String(it.repository_url || "").match(/repos\/([^/]+)\//)
          return m
        }).length)
      // recount all as external if sample all external
      const sampleExt = externalMergedPrs
      const sampleN = items.length
      externalMergedPrs = Math.round(total * (sampleExt / sampleN))
    }
  } catch {
    externalMergedPrs = 0
  }

  // collab: member repos not owned + unique non-owned repos from events
  const collabNames = new Set()
  for (const r of memberRepos) {
    if (r.owner?.login && r.owner.login.toLowerCase() !== login.toLowerCase() && !r.fork) {
      collabNames.add(r.full_name)
    }
  }
  for (const [full, meta] of eventRepos) {
    const [owner] = full.split("/")
    if (owner.toLowerCase() !== login.toLowerCase() && meta.pushes + meta.prs > 0) {
      collabNames.add(full)
    }
  }
  const collabReposCount = collabNames.size

  // --- sample repos for deep scan: owned + top event repos on *verified* orgs only ---
  const orgEventRepos = [...eventRepos.values()]
    .filter((r) => {
      const [owner] = r.full_name.split("/")
      return verifiedOrgs.has(owner) && r.pushes >= 1
    })
    .sort((a, b) => b.pushes + b.prs - (a.pushes + a.prs))
    .slice(0, 8)

  // Prefer technical repos for structure/volume sample
  const ownedSample = [...technicalOwned]
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
    .slice(0, 8)
  // if few technical, pad with remaining owned (still non-fork)
  if (ownedSample.length < 4) {
    for (const r of [...owned].sort(
      (a, b) => new Date(b.pushed_at) - new Date(a.pushed_at),
    )) {
      if (ownedSample.some((x) => x.full_name === r.full_name)) continue
      ownedSample.push(r)
      if (ownedSample.length >= 8) break
    }
  }

  /** @type {{ full_name: string, stars?: number, pushed_at?: string, topics?: string[], description?: string|null, source: string }[]} */
  const sampleMeta = []
  for (const r of ownedSample) {
    sampleMeta.push({
      full_name: r.full_name,
      stars: r.stargazers_count,
      pushed_at: r.pushed_at,
      topics: r.topics,
      description: r.description,
      source: "owned",
      default_branch: r.default_branch,
      size: r.size,
    })
  }
  for (const er of orgEventRepos) {
    if (sampleMeta.some((s) => s.full_name === er.full_name)) continue
    const repo = gh(`repos/${er.full_name}`, { allowFail: true })
    if (!repo || repo.fork) continue
    sampleMeta.push({
      full_name: repo.full_name,
      stars: repo.stargazers_count,
      pushed_at: repo.pushed_at,
      topics: repo.topics,
      description: repo.description,
      source: "org_event",
      default_branch: repo.default_branch,
      size: repo.size,
      eventPushes: er.pushes,
      eventPrs: er.prs,
    })
  }

  // stars: owned non-fork only (never inflate with popular org repos)
  const totalStars = owned.reduce((s, r) => s + (r.stargazers_count || 0), 0)

  let totalAdditions = 0
  let totalDeletions = 0
  const structureScores = []
  const texts = []
  const topicsAll = []

  for (const r of sampleMeta.slice(0, 12)) {
    texts.push(r.full_name, r.description || "")
    topicsAll.push(...(r.topics || []))

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const stats = gh(`repos/${r.full_name}/stats/contributors`, {
          allowFail: true,
        })
        if (Array.isArray(stats) && stats.length > 0) {
          const me = stats.find(
            (c) => c.author?.id === user.id || c.author?.login === login,
          )
          if (me?.weeks) {
            for (const w of me.weeks) {
              totalAdditions += w.a || 0
              totalDeletions += w.d || 0
            }
          }
          break
        }
        sleep(900)
      } catch {
        sleep(600)
      }
    }

    try {
      const branch = r.default_branch || "main"
      const ref = gh(
        `repos/${r.full_name}/git/ref/heads/${encodeURIComponent(branch)}`,
        { allowFail: true },
      )
      const sha = ref?.object?.sha
      if (sha) {
        const tree = gh(`repos/${r.full_name}/git/trees/${sha}?recursive=1`, {
          allowFail: true,
        })
        const paths = (tree?.tree || [])
          .filter((t) => t.type === "blob")
          .map((t) => t.path)
          .slice(0, 3000)
        structureScores.push(structureFromTree(paths))
        for (const p of paths.slice(0, 400)) {
          if (/prompts?\/|agents?\/|mcp\/|\.ipynb$/i.test(p)) texts.push(p)
        }
      } else {
        structureScores.push(0.25)
      }
    } catch {
      structureScores.push(0.25)
    }

    try {
      const langs = gh(`repos/${r.full_name}/languages`, { allowFail: true })
      if (langs && typeof langs === "object") texts.push(...Object.keys(langs))
    } catch {
      /* ignore */
    }
  }

  let volumeFallbackUsed = false
  if (totalAdditions === 0) {
    const sizeSum = sampleMeta.reduce((s, r) => s + (r.size || 0), 0)
    totalAdditions = Math.min(VOLUME_FALLBACK_CAP, Math.round(sizeSum * 8))
    volumeFallbackUsed = true
    console.error(
      `  volume fallback from repo sizes → additions≈${totalAdditions} (cap ${VOLUME_FALLBACK_CAP})`,
    )
  }

  const cutoff90 = Date.now() - 90 * 86400000
  const publicEvents90d = events.filter(
    (e) => new Date(e.created_at).getTime() >= cutoff90,
  ).length

  const months = new Set()
  const cutoff12 = Date.now() - 365 * 86400000
  for (const e of events) {
    const t = new Date(e.created_at).getTime()
    if (t >= cutoff12) {
      const d = new Date(e.created_at)
      months.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}`)
    }
  }
  for (const r of owned) {
    if (!r.pushed_at) continue
    const t = new Date(r.pushed_at).getTime()
    if (t >= cutoff12) {
      const d = new Date(r.pushed_at)
      months.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}`)
    }
  }
  for (const r of sampleMeta) {
    if (!r.pushed_at) continue
    const t = new Date(r.pushed_at).getTime()
    if (t >= cutoff12) {
      const d = new Date(r.pushed_at)
      months.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}`)
    }
  }

  let lastPushDays = null
  for (const r of [...owned, ...sampleMeta]) {
    const d = daysSince(r.pushed_at)
    if (d === null) continue
    if (lastPushDays === null || d < lastPushDays) lastPushDays = d
  }

  // publicRepos owned stays personal; evidence includes org sample size
  const structureMean =
    structureScores.length > 0
      ? structureScores.reduce((a, b) => a + b, 0) / structureScores.length
      : 0.15
  const aiAffinity = keywordAffinity(texts, topicsAll)

  const signals = {
    githubId: user.id,
    login: user.login,
    accountAgeDays,
    publicReposOwned: owned.length,
    technicalReposOwned: technicalOwned.length,
    totalAdditions,
    totalDeletions,
    totalStarsOnOwned: totalStars,
    daysSinceLastPush: lastPushDays,
    publicEvents90d,
    activeMonths12: months.size,
    structureMean: Number(structureMean.toFixed(4)),
    aiAffinity: Number(aiAffinity.toFixed(4)),
    externalMergedPrs,
    publicOrgCount,
    collabReposCount,
    orgPushEvents,
  }

  const evidence = {
    collectorVersion: COLLECTOR_VERSION,
    verifiedOrgs: verifiedOrgList,
    eventOrgs: [...eventOrgs],
    pushesByOwner: Object.fromEntries(pushesByOwner),
    company: user.company,
    volumeFallbackUsed,
    technicalRepos: technicalOwned.map((r) => r.full_name).slice(0, 40),
    docProfileRepos: docOnlyOwned.map((r) => r.full_name),
    collabRepos: [...collabNames].slice(0, 30),
    sampleRepos: sampleMeta.map((r) => ({
      full_name: r.full_name,
      source: r.source,
      stars: r.stars,
      pushed_at: r.pushed_at,
      eventPushes: r.eventPushes,
    })),
    externalPrSampleCount: externalPrSample.length,
  }

  // SSoT: same pure function as worker
  const report = scoreProfile(signals, { acceptThreshold: 65 })

  const profile = {
    collectedAt: new Date().toISOString(),
    source: "github-api+gh-cli",
    collectorVersion: COLLECTOR_VERSION,
    url: `https://github.com/${login}`,
    user: {
      id: user.id,
      login: user.login,
      name: user.name,
      bio: user.bio,
      company: user.company,
      created_at: user.created_at,
      public_repos: user.public_repos,
      followers: user.followers,
    },
    evidence,
    signals,
    score: report,
  }

  const path = `${OUT}/${login}.json`
  writeFileSync(path, JSON.stringify(profile, null, 2))
  console.error(
    `wrote ${path} → ${report.total}/100 ${report.decision} path=${report.path} specialty=${report.specialty} techRepos=${technicalOwned.length} orgs=${publicOrgCount} orgPush=${orgPushEvents}`,
  )
  return profile
}

mkdirSync(OUT, { recursive: true })
const results = []
for (const u of USERS) {
  try {
    results.push(collect(u))
  } catch (e) {
    console.error(`FAIL ${u}:`, e.message || e)
  }
  sleep(1500)
}

const summary = {
  collectedAt: new Date().toISOString(),
  threshold: 65,
  scorerVersion: "0.1.0",
  collectorVersion: COLLECTOR_VERSION,
  scorerVersion: results[0]?.score?.version ?? "0.2.0-specialty",
  note: "v0.4 specialty: total=0.7*max(craft,ecosystem)+0.2*activity+0.1*ai; floor specialty≥0.45; craft=public technical repos; ecosystem=extPR/orgPush/collab. SSoT scoreProfile. D11 not applied.",
  profiles: results.map((p) => ({
    login: p.signals.login,
    url: p.url,
    total: p.score.total,
    decision: p.score.decision,
    path: p.score.path,
    specialty: p.score.specialty,
    hardFail: p.score.hardFail,
    axesPct: Object.fromEntries(
      Object.entries(p.score.axes).map(([k, v]) => [k, Math.round(v.raw * 100)]),
    ),
    technicalReposOwned: p.signals.technicalReposOwned,
    publicReposOwned: p.signals.publicReposOwned,
    orgs: p.evidence.verifiedOrgs,
    orgPushEvents: p.signals.orgPushEvents,
    collabReposCount: p.signals.collabReposCount,
    externalMergedPrs: p.signals.externalMergedPrs,
    signals: p.signals,
    file: `docs/product/profiles/${p.signals.login}.json`,
  })),
}
writeFileSync(`${OUT}/SUMMARY.json`, JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary, null, 2))
