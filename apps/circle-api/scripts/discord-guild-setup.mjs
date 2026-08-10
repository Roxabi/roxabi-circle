#!/usr/bin/env bun
/**
 * Discord guild ops for Roxabi Circle — layout SSoT matching the live server.
 * Loads apps/circle-api/.dev.vars (or env DISCORD_*).
 *
 * Default (safe): role check + /apply upsert + print channel IDs.
 * Does **not** create channels or rewrite overwrites unless flagged.
 *
 * Usage:
 *   bun apps/circle-api/scripts/discord-guild-setup.mjs
 *   bun apps/circle-api/scripts/discord-guild-setup.mjs --dry-run
 *   bun apps/circle-api/scripts/discord-guild-setup.mjs --create-missing
 *   bun apps/circle-api/scripts/discord-guild-setup.mjs --apply-perms
 *   bun apps/circle-api/scripts/discord-guild-setup.mjs --create-missing --apply-perms
 *
 * Permission model (live):
 *   Public:   #règles + #arrivées only (read-only)
 *   Members:  #intros + whole CERCLE (inherit) + SUPPORT#idées + VOIX hub
 *   Appeal:   #appeal visible to non-members (read/button); members hidden
 *   Tickets:  category TICKETS hidden; private appeal-{userId} channels
 *   CERCLE:   category SSoT — children are **permission-synced** (same overwrites
 *             as the category; empty overwrites ≠ Discord “Synced” UI).
 *             #github-to-watch / #news-actu / #daily-digest: synced + Gateway rules
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const API = 'https://discord.com/api/v10'
/** Script lives in apps/circle-api/scripts — package root is parent. */
const PKG_ROOT = resolve(import.meta.dir, '..')
const DEVVARS = resolve(PKG_ROOT, '.dev.vars')
const dryRun = process.argv.includes('--dry-run')
const createMissing = process.argv.includes('--create-missing')
const applyPerms = process.argv.includes('--apply-perms')

/** @type {Record<string, string>} */
function loadDevVars() {
  /** @type {Record<string, string>} */
  const out = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('DISCORD_')) out[k] = v ?? ''
  }
  if (existsSync(DEVVARS)) {
    for (const line of readFileSync(DEVVARS, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (!m) continue
      if (!(m[1] in out) || !out[m[1]]) out[m[1]] = m[2]
    }
  }
  return out
}

function setDevVar(key, value) {
  if (!existsSync(DEVVARS)) return
  let text = readFileSync(DEVVARS, 'utf8')
  const re = new RegExp(`^${key}=.*$`, 'm')
  if (re.test(text)) text = text.replace(re, `${key}=${value}`)
  else text += `\n${key}=${value}\n`
  writeFileSync(DEVVARS, text, { mode: 0o600 })
}

/**
 * @param {string} token
 * @param {string} method
 * @param {string} path
 * @param {unknown} [body]
 */
async function discord(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'RoxabiCircleSetup (github.com/Roxabi/roxabi-circle, 0.1)',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  /** @type {unknown} */
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) {
    const err = new Error(`Discord ${method} ${path} → ${res.status}`)
    // @ts-expect-error attach
    err.status = res.status
    // @ts-expect-error attach
    err.body = json
    throw err
  }
  return json
}

// Channel types
const GUILD_TEXT = 0
const GUILD_CATEGORY = 4

async function main() {
  const env = loadDevVars()
  const token = env.DISCORD_BOT_TOKEN
  const guildId = env.DISCORD_GUILD_ID
  const appId = env.DISCORD_APPLICATION_ID
  if (!token || !guildId || !appId) {
    console.error('Missing DISCORD_BOT_TOKEN / GUILD_ID / APPLICATION_ID in .dev.vars or env')
    process.exit(1)
  }

  const me = await discord(token, 'GET', '/users/@me')
  console.log(`bot=${me.username} id=${me.id}`)

  // Membership check
  try {
    await discord(token, 'GET', `/guilds/${guildId}?with_counts=true`)
  } catch (e) {
    // @ts-expect-error
    if (e.status === 403 || e.status === 404) {
      console.error(
        'Bot is not in the guild (or missing access). Authorize first:\n' +
          `https://discord.com/api/oauth2/authorize?client_id=${appId}&permissions=71135414272&scope=bot%20applications.commands&guild_id=${guildId}&disable_guild_select=true`,
      )
      process.exit(2)
    }
    throw e
  }

  const guild = await discord(token, 'GET', `/guilds/${guildId}?with_counts=true`)
  console.log(`guild=${guild.name} members≈${guild.approximate_member_count}`)

  const roles = await discord(token, 'GET', `/guilds/${guildId}/roles`)
  let memberRole = roles.find((r) => r.name === 'member')
  if (!memberRole) {
    if (dryRun) {
      console.log('[dry-run] would create role member')
    } else {
      memberRole = await discord(token, 'POST', `/guilds/${guildId}/roles`, {
        name: 'member',
        mentionable: false,
        hoist: true,
        color: 0x6c8cff,
        permissions: '0',
        reason: 'Roxabi Circle setup — accepted members',
      })
      console.log(`created role member id=${memberRole.id}`)
    }
  } else {
    console.log(`role member exists id=${memberRole.id}`)
  }

  // Put bot role above member (by position)
  const botMember = await discord(token, 'GET', `/guilds/${guildId}/members/${me.id}`)
  const botRoleIds = new Set(botMember.roles ?? [])
  const botRoles = roles.filter((r) => botRoleIds.has(r.id) && r.name !== '@everyone')
  // Managed bot role is usually the one with tags.bot_id
  const managedBotRole =
    roles.find((r) => r.tags?.bot_id === me.id) ??
    botRoles.sort((a, b) => b.position - a.position)[0]

  if (memberRole && managedBotRole && !dryRun) {
    // Discord: higher position = higher in hierarchy UI
    // Assign positions: botRole > member > rest keep relative order roughly
    const everyone = roles.find((r) => r.name === '@everyone')
    const positions = [
      { id: managedBotRole.id, position: Math.max(managedBotRole.position, 2) },
      { id: memberRole.id, position: Math.max(managedBotRole.position, 2) - 1 },
    ]
    if (everyone) {
      // no-op for everyone (always 0)
    }
    try {
      await discord(token, 'PATCH', `/guilds/${guildId}/roles`, positions)
      console.log(`role hierarchy: bot role (${managedBotRole.name}) above member`)
    } catch (e) {
      console.warn(
        'could not reorder roles (need Manage Roles + bot role high enough):',
        // @ts-expect-error
        e.body ?? e.message,
      )
    }
  }

  if (memberRole?.id) {
    setDevVar('DISCORD_MEMBER_ROLE_ID', memberRole.id)
    console.log(`updated .dev.vars DISCORD_MEMBER_ROLE_ID`)
  }

  // ── Permission bits (bigint for high thread bits) ──────────────────────
  const bit = (n) => 1n << BigInt(n)
  const sumBits = (...ns) => String(ns.reduce((a, n) => a + bit(n), 0n))
  // VIEW=10 SEND=11 REACT=6 EMBED=14 ATTACH=15 HISTORY=16 EXT_EMOJI=18
  // MANAGE_MSG=13 MANAGE_CH=4 APP_CMD=31 MANAGE_THREADS=34
  // CREATE_PUB_THREAD=35 SEND_IN_THREAD=38 EXT_STICKER=37 CONNECT=20 SPEAK=21 VAD=25
  const VIEW = sumBits(10)
  const MEMBER_TEXT_ALLOW = sumBits(10, 11, 6, 14, 15, 16, 18, 37, 31, 35, 38)
  const BOT_TEXT_ALLOW = sumBits(10, 11, 6, 14, 15, 16, 18, 37, 31, 35, 38, 13, 4, 34)
  const THREAD_ONLY_MEMBER_ALLOW = sumBits(10, 6, 14, 15, 16, 18, 37, 31, 35, 38)
  const THREAD_ONLY_MEMBER_DENY = sumBits(11) // SEND_MESSAGES
  const PUBLIC_READ_ALLOW = sumBits(10, 16) // VIEW + HISTORY
  const PUBLIC_READ_DENY = sumBits(11, 14, 15) // SEND, EMBED, ATTACH
  const PUBLIC_READ_SILENT_DENY = sumBits(11, 14, 15, 6, 31) // + REACT + APP_CMD
  const BOT_MOD_ALLOW = sumBits(10, 11, 13, 14, 15, 16)
  const MEMBER_VOICE_HUB = sumBits(10, 20, 21, 25) // VIEW CONNECT SPEAK VAD
  const EVERYONE_VOICE_DENY = sumBits(10, 20)

  const ids = {
    everyone: guildId,
    member: memberRole?.id,
    bot: managedBotRole?.id,
  }

  /** @param {any[]} rows */
  function ows(...rows) {
    return rows.filter(Boolean)
  }
  function roleOw(id, allow, deny = '0') {
    return id ? { id, type: 0, allow, deny } : null
  }

  /**
   * Category-level templates.
   * @param {"gatePublic" | "memberText" | "memberView" | "ticketsHidden"} kind
   */
  function categoryOverwrites(kind) {
    const { everyone, member, bot } = ids
    if (kind === 'gatePublic') {
      // ENTRÉE: default hidden; public channels grant @everyone VIEW themselves
      return ows(roleOw(everyone, '0', VIEW), roleOw(member, VIEW), roleOw(bot, VIEW))
    }
    if (kind === 'memberText') {
      // CERCLE: SSoT text for members; children inherit empty overwrites
      return ows(
        roleOw(everyone, '0', VIEW),
        roleOw(member, MEMBER_TEXT_ALLOW),
        roleOw(bot, BOT_TEXT_ALLOW),
      )
    }
    if (kind === 'memberView') {
      // SUPPORT / VOIX shell — children refine
      return ows(roleOw(everyone, '0', VIEW), roleOw(member, VIEW), roleOw(bot, VIEW))
    }
    if (kind === 'ticketsHidden') {
      // Private tickets only — nobody browses the category
      return ows(
        roleOw(everyone, '0', VIEW),
        roleOw(member, '0', VIEW),
        roleOw(bot, BOT_TEXT_ALLOW),
      )
    }
    return []
  }

  /**
   * Channel-level modes.
   * For Discord UI “Synced with category”, overwrites must **equal** the parent
   * category’s list (empty array is NOT synced — it only inherits at calc time).
   * @param {string} mode
   * @param {any[]} parentCatOws category overwrites to clone for sync modes
   */
  function channelOverwrites(mode, parentCatOws = []) {
    const { everyone, member, bot } = ids
    /** deep-copy category rows → channel is permission-synced */
    const synced = () =>
      parentCatOws.map((o) => ({
        id: o.id,
        type: o.type,
        allow: String(o.allow ?? '0'),
        deny: String(o.deny ?? '0'),
      }))
    switch (mode) {
      case 'inherit':
      case 'linksTopLevel':
        // linksTopLevel: Discord-synced; content rules are Gateway-only.
        return synced()
      case 'threadOnly':
        // Deliberately unsynced: deny top-level SEND for members.
        return ows(
          roleOw(member, THREAD_ONLY_MEMBER_ALLOW, THREAD_ONLY_MEMBER_DENY),
          roleOw(bot, BOT_TEXT_ALLOW),
        )
      case 'publicRead':
        return ows(
          roleOw(everyone, PUBLIC_READ_ALLOW, PUBLIC_READ_DENY),
          roleOw(member, PUBLIC_READ_ALLOW, PUBLIC_READ_DENY),
          roleOw(bot, BOT_MOD_ALLOW),
        )
      case 'publicReadSilent':
        return ows(
          roleOw(everyone, PUBLIC_READ_ALLOW, PUBLIC_READ_SILENT_DENY),
          roleOw(member, PUBLIC_READ_ALLOW, PUBLIC_READ_SILENT_DENY),
          roleOw(bot, BOT_MOD_ALLOW),
        )
      case 'memberText':
        return ows(
          roleOw(everyone, '0', VIEW),
          roleOw(member, MEMBER_TEXT_ALLOW),
          roleOw(bot, BOT_TEXT_ALLOW),
        )
      case 'appealHub':
        // Non-members: view + history (button). Members: hidden (already accepted).
        // Send denied for everyone — open ticket via interactions only.
        return ows(
          roleOw(everyone, PUBLIC_READ_ALLOW, PUBLIC_READ_SILENT_DENY),
          roleOw(member, '0', VIEW),
          roleOw(bot, sumBits(10, 11, 6, 13, 14, 15, 16)),
        )
      case 'voiceHub':
        return ows(
          roleOw(everyone, '0', EVERYONE_VOICE_DENY),
          roleOw(member, MEMBER_VOICE_HUB),
          roleOw(bot, BOT_TEXT_ALLOW),
        )
      default:
        return synced()
    }
  }

  /**
   * Live layout SSoT (2026-08-10).
   * @typedef {{ name: string, topic?: string, mode?: string, type?: number }} ChildCh
   * @typedef {{ name: string, catMode: string, children?: ChildCh[] }} CatLayout
   * @type {CatLayout[]}
   */
  const layout = [
    {
      name: 'ENTRÉE',
      catMode: 'gatePublic',
      children: [
        {
          name: 'règles',
          mode: 'publicRead',
          topic: 'Règles du cercle — lisibles par tous. Accès membre après /apply.',
        },
        {
          name: 'arrivées',
          mode: 'publicReadSilent',
          topic: 'Notifications d’arrivée — lecture seule (messages système Discord).',
        },
        {
          name: 'intros',
          mode: 'memberText',
          topic: 'Présente-toi : stack, focus IA/OSS, ce que tu partages.',
        },
      ],
    },
    {
      name: 'CERCLE',
      catMode: 'memberText',
      children: [
        {
          name: 'general',
          mode: 'inherit',
          topic: 'Discussion technique — harness, MCP, agents, stack.',
        },
        {
          name: 'daily-digest',
          // Synced with CERCLE; Gateway: bots only top-level + auto-thread (like news/github).
          mode: 'linksTopLevel',
          topic:
            'Digest Lyra (bot) en top-level. Discussion → réponds en thread sous le digest (pas de chat top-level).',
        },
        {
          name: 'ai-agentic-workflow',
          mode: 'inherit',
          topic: 'Workflows agentiques, harness, orchestration.',
        },
        {
          name: 'dev-with-ai',
          mode: 'inherit',
          topic: 'Dev assisté IA — patterns, outils, retours terrain.',
        },
        {
          name: 'news-actu',
          mode: 'linksTopLevel',
          topic:
            'Un lien actu (http/https) par message top-level. Discussion → réponds en thread sous le lien.',
        },
        {
          name: 'github-to-watch',
          mode: 'linksTopLevel',
          topic:
            'Un lien GitHub (repo/PR/issue) par message top-level. Tout le reste → thread sous le lien.',
        },
        { name: 'showcase', mode: 'inherit', topic: 'Ship, repos, demos, write-ups.' },
        {
          name: 'opportunités',
          mode: 'inherit',
          topic: 'Jobs, collabs, appels à projet — cercle only.',
        },
      ],
    },
    {
      name: 'SUPPORT',
      catMode: 'memberView',
      children: [
        {
          name: 'idées-améliorations',
          mode: 'memberText',
          topic: 'Suggestions produit / process — membres only.',
        },
        {
          name: 'appeal',
          mode: 'appealHub',
          topic:
            'Cas edge (OSS surtout privé, faux négatif). Non-membres : ouvrir un ticket (bouton). Membres : masqué.',
        },
      ],
    },
    {
      name: 'VOIX',
      catMode: 'memberView',
      children: [
        {
          name: '➕ créer un salon',
          mode: 'voiceHub',
          type: 2, // GUILD_VOICE
          topic: '',
        },
      ],
    },
    {
      name: 'TICKETS',
      catMode: 'ticketsHidden',
      children: [], // private appeal-{userId} created by Worker only
    },
  ]

  console.log(
    `\nflags: dryRun=${dryRun} createMissing=${createMissing} applyPerms=${applyPerms}` +
      ` (default is inventory-only for channels)`,
  )

  const channels = await discord(token, 'GET', `/guilds/${guildId}/channels`)
  /** @type {Map<string, any>} */
  const byName = new Map(channels.map((c) => [c.name, c]))

  for (const cat of layout) {
    let parent = byName.get(cat.name)
    const catOws = categoryOverwrites(cat.catMode)

    if (!parent) {
      if (!createMissing) {
        console.log(`category MISSING ${cat.name} (pass --create-missing)`)
        continue
      }
      if (dryRun) {
        console.log(`[dry-run] create category ${cat.name} mode=${cat.catMode}`)
        parent = { id: 'dry', name: cat.name }
      } else {
        parent = await discord(token, 'POST', `/guilds/${guildId}/channels`, {
          name: cat.name,
          type: GUILD_CATEGORY,
          permission_overwrites: catOws,
          reason: 'Roxabi Circle setup',
        })
        byName.set(cat.name, parent)
        console.log(`created category ${cat.name}`)
      }
    } else {
      console.log(`category exists ${cat.name}`)
      if (applyPerms && !dryRun && memberRole?.id) {
        try {
          await discord(token, 'PATCH', `/channels/${parent.id}`, {
            permission_overwrites: catOws,
          })
          console.log(`  applied category overwrites ${cat.name}`)
        } catch (e) {
          console.warn(
            `  skip category patch ${cat.name}:`,
            // @ts-expect-error
            e.body ?? e.message,
          )
        }
      }
    }

    for (const ch of cat.children ?? []) {
      const chType = ch.type ?? GUILD_TEXT
      let existing = byName.get(ch.name)
      if (existing && existing.type !== chType) {
        existing = channels.find((c) => c.name === ch.name && c.type === chType)
      }

      const mode = ch.mode ?? 'inherit'
      const overwrites = channelOverwrites(mode, catOws)

      if (!existing) {
        if (!createMissing) {
          console.log(`  channel MISSING #${ch.name} (pass --create-missing)`)
          continue
        }
        if (dryRun) {
          console.log(`[dry-run] create #${ch.name} under ${cat.name} mode=${mode}`)
        } else if (parent?.id && parent.id !== 'dry') {
          const created = await discord(token, 'POST', `/guilds/${guildId}/channels`, {
            name: ch.name,
            type: chType,
            parent_id: parent.id,
            topic: chType === GUILD_TEXT ? (ch.topic ?? '') : undefined,
            permission_overwrites: overwrites.length ? overwrites : undefined,
            reason: 'Roxabi Circle setup',
          })
          byName.set(ch.name, created)
          console.log(`  created #${ch.name} mode=${mode}`)
        }
      } else {
        const owCount = (existing.permission_overwrites || []).length
        console.log(`  channel exists #${ch.name} mode=${mode} overwrites=${owCount}`)
        if (applyPerms && !dryRun && memberRole?.id) {
          try {
            /** @type {Record<string, unknown>} */
            const patch = {
              parent_id: parent?.id && parent.id !== 'dry' ? parent.id : existing.parent_id,
            }
            if (chType === GUILD_TEXT && ch.topic) patch.topic = ch.topic
            // Always set overwrites list (empty = inherit) when applying perms
            patch.permission_overwrites = overwrites
            await discord(token, 'PATCH', `/channels/${existing.id}`, patch)
            console.log(`    applied perms mode=${mode} ow=${overwrites.length}`)
          } catch (e) {
            console.warn(
              `    skip patch #${ch.name}:`,
              // @ts-expect-error
              e.body ?? e.message,
            )
          }
        }
      }
    }
  }

  // Guild command /apply
  const commands = await discord(token, 'GET', `/applications/${appId}/guilds/${guildId}/commands`)
  const applyCmd = {
    name: 'apply',
    description: 'Candidater au Roxabi Circle (lien GitHub OAuth + consignes PR).',
    type: 1,
    dm_permission: false,
  }
  const existingCmd = Array.isArray(commands) ? commands.find((c) => c.name === 'apply') : null

  if (dryRun) {
    console.log('[dry-run] would upsert guild command /apply')
  } else if (existingCmd) {
    await discord(
      token,
      'PATCH',
      `/applications/${appId}/guilds/${guildId}/commands/${existingCmd.id}`,
      applyCmd,
    )
    console.log(`updated guild command /apply id=${existingCmd.id}`)
  } else {
    const created = await discord(
      token,
      'POST',
      `/applications/${appId}/guilds/${guildId}/commands`,
      applyCmd,
    )
    console.log(`created guild command /apply id=${created.id}`)
  }

  // Refresh map after possible creates
  const channelsNow = await discord(token, 'GET', `/guilds/${guildId}/channels`)
  const byNameNow = new Map(channelsNow.map((/** @type {any} */ c) => [c.name, c]))

  console.log('\n=== setup done ===')
  console.log(`flags: createMissing=${createMissing} applyPerms=${applyPerms}`)
  if (memberRole?.id) console.log(`DISCORD_MEMBER_ROLE_ID=${memberRole.id}`)
  const printId = (label, name) => {
    const c = byNameNow.get(name)
    if (c?.id) console.log(`${label}=${c.id}`)
  }
  printId('DISCORD_GITHUB_WATCH_CHANNEL_ID', 'github-to-watch')
  printId('DISCORD_NEWS_ACTU_CHANNEL_ID', 'news-actu')
  printId('DISCORD_DAILY_DIGEST_CHANNEL_ID', 'daily-digest')
  printId('DISCORD_VOICE_HUB_CHANNEL_ID', '➕ créer un salon')
  printId('DISCORD_VOICE_CATEGORY_ID', 'VOIX')
  printId('DISCORD_APPEAL_CATEGORY_ID', 'TICKETS')
  printId('DISCORD_APPEAL_CHANNEL_ID', 'appeal')
  console.log(
    'Next: Interactions URL https://circle.roxabi.dev/interactions · real bot token from BW only',
  )
}

main().catch((e) => {
  console.error(e.message)
  if (e.body) console.error(JSON.stringify(e.body, null, 2))
  process.exit(1)
})
