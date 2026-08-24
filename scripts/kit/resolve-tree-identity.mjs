#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
/**
 * ADR-0009 D5 tree classifier — shared by extract-dry-run and (future) zero-edit.
 *
 * Env overrides (harness-only):
 *   EXTRACT_MODE + EXTRACT_HARNESS_SENTINEL
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const KIT_EXAMPLE_APPS = ['example-api', 'example-web', 'example-web-branded', 'mcp-example']

/** @param {string} name */
export function isKitExampleApp(name) {
  return KIT_EXAMPLE_APPS.includes(name)
}

/** @param {string} relPath */
export function isProductAppPath(relPath) {
  const p = relPath.replace(/^\.\//, '')
  if (!p.startsWith('apps/')) return false
  const appName = p.slice('apps/'.length).split('/')[0]
  return appName.length > 0 && !isKitExampleApp(appName)
}

function loadJson(path, label) {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    throw new Error(`invalid JSON (${label}): ${path}: ${e.message}`)
  }
}

function git(root, args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  } catch (e) {
    if (allowFail) return ''
    const err = (e.stderr || e.message || '').toString()
    throw new Error(`git ${args.join(' ')} failed:\n${err}`)
  }
}

function normalizeOriginUrl(url) {
  let u = (url || '').trim()
  if (!u) return ''
  u = u.replace(/\.git$/, '')
  const ssh = u.match(/^git@github\.com:(.+)$/)
  if (ssh) return ssh[1]
  const https = u.match(/^https:\/\/github\.com\/(.+)$/)
  if (https) return https[1]
  return u
}

/**
 * @param {{
 *   root: string
 *   zonesFile?: string
 *   modeEnv?: string
 *   harnessSentinel?: string
 * }} opts
 * @returns {{ mode: 'kit' | 'product', identity: string, classifiedMode: 'kit' | 'product' }}
 */
export function resolveTreeIdentity({
  root,
  zonesFile = 'config/kit/zero-edit-zones.json',
  modeEnv = '',
  harnessSentinel = '',
}) {
  const zonesPath = join(root, zonesFile)
  const zones = loadJson(zonesPath, 'zones')
  if (!zones || zones.version !== 1) {
    throw new Error(`zones config must have version: 1 (${zonesPath})`)
  }

  const inheritanceFile = zones.inheritance_file || 'config/product/inheritance.json'
  const inheritancePath = join(root, inheritanceFile)
  const allowlist = new Set(zones.kit_origin_allowlist || [])

  const originUrl = git(root, ['remote', 'get-url', 'origin'], { allowFail: true })
  const originId = normalizeOriginUrl(originUrl)
  const ghRepo = (process.env.GITHUB_REPOSITORY || '').trim()
  const identity = ghRepo || originId
  const onAllowlist = identity !== '' && allowlist.has(identity)

  const inheritanceDoc = loadJson(inheritancePath, 'inheritance')
  const hasInheritance = Boolean(inheritanceDoc?.upstreamCommit)

  let classifiedMode
  if (hasInheritance) {
    if (onAllowlist) {
      throw new Error(
        `inheritance marker present on kit-allowlisted origin "${identity}" — mirrors/kits must not carry product markers`,
      )
    }
    classifiedMode = 'product'
  } else if (onAllowlist) {
    classifiedMode = 'kit'
  } else {
    throw new Error(
      `cannot classify repo (no marker, origin/identity "${identity || '(empty)'}" not in kit_origin_allowlist).\n` +
        `  Product: add ${inheritanceFile} after merge upstream.\n` +
        `  Kit/mirror: add repo to config/kit/zero-edit-zones.json kit_origin_allowlist.`,
    )
  }

  const harnessOk = modeEnv && harnessSentinel && existsSync(harnessSentinel)

  if (modeEnv) {
    if (!harnessOk) {
      throw new Error(
        `EXTRACT_MODE is set but EXTRACT_HARNESS_SENTINEL is missing/unusable — forbidden on normal lefthook/CI (ADR-0009 D5)`,
      )
    }
    if (!['kit', 'product', 'strict', 'mono'].includes(modeEnv)) {
      throw new Error(`unknown EXTRACT_MODE "${modeEnv}" (use kit|product|strict|mono)`)
    }
    let mode = classifiedMode
    if (modeEnv === 'kit' || modeEnv === 'strict') {
      mode = 'kit'
    } else if (modeEnv === 'mono') {
      // Permissive audit label — never bypass kit allowlist on kit-classified trees.
      mode = classifiedMode === 'kit' ? 'kit' : 'product'
    } else if (modeEnv === 'product') {
      mode = 'product'
    }
    return { mode, identity, classifiedMode }
  }

  return { mode: classifiedMode, identity, classifiedMode }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  const root = process.env.ROOT || process.cwd()
  const modeEnv = process.env.EXTRACT_MODE || ''
  const harnessSentinel = process.env.EXTRACT_HARNESS_SENTINEL || ''
  try {
    const { mode, identity } = resolveTreeIdentity({ root, modeEnv, harnessSentinel })
    console.log(`mode=${mode} identity=${identity || '(none)'}`)
  } catch (e) {
    console.error(`resolve-tree-identity: ${e.message}`)
    process.exit(1)
  }
}
