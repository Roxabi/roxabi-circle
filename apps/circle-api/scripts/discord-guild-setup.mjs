#!/usr/bin/env bun
/**
 * One-shot Discord guild ops for Roxabi Circle.
 * Loads apps/circle-api/.dev.vars (or env). Idempotent where possible.
 *
 * Creates:
 *  - role `member`
 *  - categories + channels: entrée, communauté, ops
 *  - guild slash command `/apply`
 *  - basic overwrites (member vs @everyone)
 *  - updates .dev.vars DISCORD_MEMBER_ROLE_ID
 *
 * Usage:
 *   bun apps/circle-api/scripts/discord-guild-setup.mjs
 *   bun apps/circle-api/scripts/discord-guild-setup.mjs --dry-run
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const API = 'https://discord.com/api/v10'
/** Script lives in apps/circle-api/scripts — package root is parent. */
const PKG_ROOT = resolve(import.meta.dir, '..')
const DEVVARS = resolve(PKG_ROOT, '.dev.vars')
const dryRun = process.argv.includes('--dry-run')

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

  // Channels layout
  // memberOnly on a category = SSoT overwrites (children inherit by default)
  // Channel modes under a memberOnly category:
  //   inherit (default) — empty channel overwrites
  //   threadOnly        — no top-level SEND; react + create/public threads + send in threads
  //   linksTopLevel     — SEND ok; Gateway bot enforces 1 URL top-level (github-watch / news-actu)
  // memberOnly on a channel only = overwrites on that channel (parent stays public)
  //
  // Use bigint for thread bits (CREATE_PUBLIC_THREADS = 1<<35, etc.)
  const bit = (n) => 1n << BigInt(n)
  const sumBits = (...ns) => String(ns.reduce((a, n) => a + bit(n), 0n))

  // VIEW=10 SEND=11 REACT=6 EMBED=14 ATTACH=15 HISTORY=16 EXT_EMOJI=18
  // MANAGE_MSG=13 MANAGE_CH=4 APP_CMD=31 MANAGE_THREADS=34
  // CREATE_PUB_THREAD=35 SEND_IN_THREAD=38 EXT_STICKER=37
  const MEMBER_TEXT_ALLOW = sumBits(10, 11, 6, 14, 15, 16, 18, 37, 31, 35, 38)
  const BOT_TEXT_ALLOW = sumBits(10, 11, 6, 14, 15, 16, 18, 37, 31, 35, 38, 13, 4, 34)
  const THREAD_ONLY_MEMBER_ALLOW = sumBits(10, 6, 14, 15, 16, 18, 37, 31, 35, 38)
  const THREAD_ONLY_MEMBER_DENY = sumBits(11) // SEND_MESSAGES
  const LINKS_TOP_MEMBER_ALLOW = MEMBER_TEXT_ALLOW

  /**
   * @param {{ memberRoleId: string, botRoleId?: string }} ids
   */
  function memberOnlyOverwrites({ memberRoleId, botRoleId }) {
    /** @type {any[]} */
    const overwrites = [
      {
        id: guildId, // @everyone === guild id
        type: 0,
        deny: sumBits(10),
        allow: '0',
      },
      {
        id: memberRoleId,
        type: 0,
        allow: MEMBER_TEXT_ALLOW,
        deny: '0',
      },
    ]
    if (botRoleId) {
      overwrites.push({
        id: botRoleId,
        type: 0,
        allow: BOT_TEXT_ALLOW,
        deny: '0',
      })
    }
    return overwrites
  }

  /**
   * Channel-level overwrites that override category inheritance for special modes.
   * @param {"threadOnly" | "linksTopLevel"} mode
   * @param {{ memberRoleId: string, botRoleId?: string }} ids
   */
  function channelModeOverwrites(mode, { memberRoleId, botRoleId }) {
    /** @type {any[]} */
    const overwrites = []
    if (mode === 'threadOnly') {
      overwrites.push({
        id: memberRoleId,
        type: 0,
        allow: THREAD_ONLY_MEMBER_ALLOW,
        deny: THREAD_ONLY_MEMBER_DENY,
      })
    } else if (mode === 'linksTopLevel') {
      overwrites.push({
        id: memberRoleId,
        type: 0,
        allow: LINKS_TOP_MEMBER_ALLOW,
        deny: '0',
      })
    }
    if (botRoleId) {
      overwrites.push({
        id: botRoleId,
        type: 0,
        allow: BOT_TEXT_ALLOW,
        deny: '0',
      })
    }
    return overwrites
  }

  /**
   * @typedef {{ name: string, topic?: string, memberOnly?: boolean, mode?: "inherit" | "threadOnly" | "linksTopLevel" }} ChildCh
   * @typedef {{ name: string, type: number, memberOnly?: boolean, children?: ChildCh[] }} CatLayout
   * @type {CatLayout[]}
   */
  const layout = [
    {
      name: 'ENTRÉE',
      type: GUILD_CATEGORY,
      children: [
        {
          name: 'accueil',
          topic:
            'Bienvenue dans le Roxabi Circle. Utilise /apply pour candidater (GitHub + PR d’entrée).',
          memberOnly: false,
        },
        {
          name: 'apply-help',
          topic: 'Questions sur le process d’entrée (pas de spoiler scoring).',
          memberOnly: false,
        },
      ],
    },
    {
      name: 'CERCLE',
      type: GUILD_CATEGORY,
      // Gate once at category — open children inherit full text + threads
      memberOnly: true,
      children: [
        {
          name: 'general',
          topic: 'Discussion technique — harness, MCP, agents, stack.',
          mode: 'inherit',
        },
        {
          name: 'daily-digest',
          topic:
            'Digest Lyra — pas de post top-level. Réagis ou ouvre un thread sous le digest pour discuter.',
          mode: 'threadOnly',
        },
        {
          name: 'ai-agentic-workflow',
          topic: 'Workflows agentiques, harness, orchestration.',
          mode: 'inherit',
        },
        {
          name: 'dev-with-ai',
          topic: 'Dev assisté IA — patterns, outils, retours terrain.',
          mode: 'inherit',
        },
        {
          name: 'github-to-watch',
          topic:
            'Un lien GitHub (repo/PR/issue) par message top-level. Tout le reste → thread sous le lien.',
          mode: 'linksTopLevel',
        },
        {
          name: 'news-actu',
          topic:
            'Un lien actu (http/https) par message top-level. Discussion → réponds en thread sous le lien (pas de chat top-level).',
          mode: 'linksTopLevel',
        },
        {
          name: 'showcase',
          topic: 'Ship, repos, demos, write-ups.',
          mode: 'inherit',
        },
        {
          name: 'opportunités',
          topic: 'Jobs, collabs, appels à projet — cercle only.',
          mode: 'inherit',
        },
      ],
    },
    {
      name: 'SUPPORT',
      type: GUILD_CATEGORY,
      children: [
        {
          name: 'appeal',
          topic:
            'Cas edge (OSS surtout privé, faux négatif). Staff review — pas un second scoring chat.',
          memberOnly: false,
        },
      ],
    },
  ]

  const channels = await discord(token, 'GET', `/guilds/${guildId}/channels`)
  /** @type {Map<string, any>} */
  const byName = new Map(channels.map((c) => [c.name, c]))

  for (const cat of layout) {
    let parent = byName.get(cat.name)
    /** @type {any[] | undefined} */
    const catOverwrites =
      cat.memberOnly && memberRole?.id
        ? memberOnlyOverwrites({
            memberRoleId: memberRole.id,
            botRoleId: managedBotRole?.id,
          })
        : undefined

    if (!parent) {
      if (dryRun) {
        console.log(`[dry-run] create category ${cat.name}`)
        parent = { id: 'dry', name: cat.name }
      } else {
        parent = await discord(token, 'POST', `/guilds/${guildId}/channels`, {
          name: cat.name,
          type: GUILD_CATEGORY,
          permission_overwrites: catOverwrites,
          reason: 'Roxabi Circle setup',
        })
        byName.set(cat.name, parent)
        console.log(`created category ${cat.name}`)
      }
    } else {
      console.log(`category exists ${cat.name}`)
      if (!dryRun && catOverwrites && memberRole?.id) {
        try {
          await discord(token, 'PATCH', `/channels/${parent.id}`, {
            permission_overwrites: catOverwrites,
          })
          console.log(`  updated category overwrites ${cat.name} (children inherit)`)
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
      let existing = byName.get(ch.name)
      // prefer text channel under this category if duplicates
      if (existing && existing.type !== GUILD_TEXT) {
        existing = channels.find((c) => c.name === ch.name && c.type === GUILD_TEXT)
      }

      const mode = ch.mode ?? (ch.memberOnly && !cat.memberOnly ? 'memberOnly' : 'inherit')

      /** @type {any[]} */
      let overwrites = []
      if (mode === 'threadOnly' || mode === 'linksTopLevel') {
        if (memberRole?.id) {
          overwrites = channelModeOverwrites(mode, {
            memberRoleId: memberRole.id,
            botRoleId: managedBotRole?.id,
          })
        }
      } else if (ch.memberOnly && !cat.memberOnly && memberRole?.id) {
        overwrites = memberOnlyOverwrites({
          memberRoleId: memberRole.id,
          botRoleId: managedBotRole?.id,
        })
      }
      // inherit under memberOnly category → empty overwrites (clear on patch)

      if (!existing) {
        if (dryRun) {
          console.log(`[dry-run] create #${ch.name} under ${cat.name} mode=${mode}`)
        } else {
          const created = await discord(token, 'POST', `/guilds/${guildId}/channels`, {
            name: ch.name,
            type: GUILD_TEXT,
            parent_id: parent.id === 'dry' ? undefined : parent.id,
            topic: ch.topic ?? '',
            permission_overwrites: overwrites.length ? overwrites : undefined,
            reason: 'Roxabi Circle setup',
          })
          byName.set(ch.name, created)
          console.log(`created #${ch.name} mode=${mode}`)
        }
      } else {
        console.log(`channel exists #${ch.name}`)
        if (!dryRun && memberRole?.id) {
          try {
            /** @type {Record<string, unknown>} */
            const patch = {
              parent_id: parent.id === 'dry' ? existing.parent_id : parent.id,
              topic: ch.topic ?? existing.topic,
            }
            if (cat.memberOnly && mode === 'inherit') {
              patch.permission_overwrites = []
            } else if (overwrites.length) {
              patch.permission_overwrites = overwrites
            }
            await discord(token, 'PATCH', `/channels/${existing.id}`, patch)
            console.log(`  mode=${mode} + topic #${ch.name}`)
          } catch (e) {
            console.warn(
              `  skip patch #${ch.name}:`,
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

  // Pin welcome in #accueil if we can post
  if (!dryRun) {
    const accueil = byName.get('accueil')
    if (accueil?.id && accueil.id !== 'dry') {
      try {
        await discord(token, 'POST', `/channels/${accueil.id}/messages`, {
          content: [
            '## Roxabi Circle',
            'Cercle fermé — IA + open source. Pas de hype touriste.',
            '',
            '**Entrée**',
            '1. `/apply` — OAuth GitHub',
            '2. PR d’entrée sur le repo dédié (unlock scoring)',
            '3. Score auto → rôle `member` ou refus + cooldown',
            '',
            'Après accept : lis **#règles**, présente-toi dans **#intros**.',
            'Cas edge (OSS surtout privé) → **#appeal**.',
            '',
            `_Bot: ${me.username} · scorer open source dans le monorepo_`,
          ].join('\n'),
        })
        console.log('posted welcome in #accueil')
      } catch (e) {
        console.warn(
          'could not post welcome (Send Messages?):',
          // @ts-expect-error
          e.body ?? e.message,
        )
      }
    }
  }

  console.log('\n=== setup done ===')
  if (memberRole?.id) console.log(`DISCORD_MEMBER_ROLE_ID=${memberRole.id}`)
  const ghWatch = byName.get('github-to-watch')
  const newsActu = byName.get('news-actu')
  if (ghWatch?.id) console.log(`DISCORD_GITHUB_WATCH_CHANNEL_ID=${ghWatch.id}`)
  if (newsActu?.id) console.log(`DISCORD_NEWS_ACTU_CHANNEL_ID=${newsActu.id}`)
  console.log(
    'Next: set Interactions Endpoint URL after Worker deploy:',
    'https://circle.roxabi.dev/interactions',
  )
  console.log('Rotate bot token if it was ever pasted in chat (Developer Portal → Reset Token).')
}

main().catch((e) => {
  console.error(e.message)
  if (e.body) console.error(JSON.stringify(e.body, null, 2))
  process.exit(1)
})
