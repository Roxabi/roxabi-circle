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
 *   bun scripts/discord-guild-setup.mjs
 *   bun scripts/discord-guild-setup.mjs --dry-run
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const API = "https://discord.com/api/v10"
const ROOT = resolve(import.meta.dir, "..")
const DEVVARS = resolve(ROOT, "apps/circle-api/.dev.vars")
const dryRun = process.argv.includes("--dry-run")

/** @type {Record<string, string>} */
function loadDevVars() {
  /** @type {Record<string, string>} */
  const out = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith("DISCORD_")) out[k] = v ?? ""
  }
  if (existsSync(DEVVARS)) {
    for (const line of readFileSync(DEVVARS, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (!m) continue
      if (!(m[1] in out) || !out[m[1]]) out[m[1]] = m[2]
    }
  }
  return out
}

function setDevVar(key, value) {
  if (!existsSync(DEVVARS)) return
  let text = readFileSync(DEVVARS, "utf8")
  const re = new RegExp(`^${key}=.*$`, "m")
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
      "Content-Type": "application/json",
      "User-Agent": "RoxabiCircleSetup (github.com/Roxabi/roxabi-circle, 0.1)",
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
    console.error("Missing DISCORD_BOT_TOKEN / GUILD_ID / APPLICATION_ID in .dev.vars or env")
    process.exit(1)
  }

  const me = await discord(token, "GET", "/users/@me")
  console.log(`bot=${me.username} id=${me.id}`)

  // Membership check
  try {
    await discord(token, "GET", `/guilds/${guildId}?with_counts=true`)
  } catch (e) {
    // @ts-expect-error
    if (e.status === 403 || e.status === 404) {
      console.error(
        "Bot is not in the guild (or missing access). Authorize first:\n" +
          `https://discord.com/api/oauth2/authorize?client_id=${appId}&permissions=71135414272&scope=bot%20applications.commands&guild_id=${guildId}&disable_guild_select=true`,
      )
      process.exit(2)
    }
    throw e
  }

  const guild = await discord(token, "GET", `/guilds/${guildId}?with_counts=true`)
  console.log(`guild=${guild.name} members≈${guild.approximate_member_count}`)

  const roles = await discord(token, "GET", `/guilds/${guildId}/roles`)
  let memberRole = roles.find((r) => r.name === "member")
  if (!memberRole) {
    if (dryRun) {
      console.log("[dry-run] would create role member")
    } else {
      memberRole = await discord(token, "POST", `/guilds/${guildId}/roles`, {
        name: "member",
        mentionable: false,
        hoist: true,
        color: 0x6c8cff,
        permissions: "0",
        reason: "Roxabi Circle setup — accepted members",
      })
      console.log(`created role member id=${memberRole.id}`)
    }
  } else {
    console.log(`role member exists id=${memberRole.id}`)
  }

  // Put bot role above member (by position)
  const botMember = await discord(token, "GET", `/guilds/${guildId}/members/${me.id}`)
  const botRoleIds = new Set(botMember.roles ?? [])
  const botRoles = roles.filter((r) => botRoleIds.has(r.id) && r.name !== "@everyone")
  // Managed bot role is usually the one with tags.bot_id
  const managedBotRole =
    roles.find((r) => r.tags?.bot_id === me.id) ??
    botRoles.sort((a, b) => b.position - a.position)[0]

  if (memberRole && managedBotRole && !dryRun) {
    // Discord: higher position = higher in hierarchy UI
    // Assign positions: botRole > member > rest keep relative order roughly
    const everyone = roles.find((r) => r.name === "@everyone")
    const positions = [
      { id: managedBotRole.id, position: Math.max(managedBotRole.position, 2) },
      { id: memberRole.id, position: Math.max(managedBotRole.position, 2) - 1 },
    ]
    if (everyone) {
      // no-op for everyone (always 0)
    }
    try {
      await discord(token, "PATCH", `/guilds/${guildId}/roles`, positions)
      console.log(
        `role hierarchy: bot role (${managedBotRole.name}) above member`,
      )
    } catch (e) {
      console.warn(
        "could not reorder roles (need Manage Roles + bot role high enough):",
        // @ts-expect-error
        e.body ?? e.message,
      )
    }
  }

  if (memberRole?.id) {
    setDevVar("DISCORD_MEMBER_ROLE_ID", memberRole.id)
    console.log(`updated .dev.vars DISCORD_MEMBER_ROLE_ID`)
  }

  // Channels layout
  /** @type {{name: string, type: number, children?: {name: string, topic?: string, memberOnly?: boolean, staffOnly?: boolean}[]}[]} */
  const layout = [
    {
      name: "ENTRÉE",
      type: GUILD_CATEGORY,
      children: [
        {
          name: "accueil",
          topic:
            "Bienvenue dans le Roxabi Circle. Utilise /apply pour candidater (GitHub + PR d’entrée).",
          memberOnly: false,
        },
        {
          name: "github-to-watch",
          topic: "Signaux / repos à surveiller — pré-cercle.",
          memberOnly: false,
        },
        {
          name: "apply-help",
          topic: "Questions sur le process d’entrée (pas de spoiler scoring).",
          memberOnly: false,
        },
      ],
    },
    {
      name: "CERCLE",
      type: GUILD_CATEGORY,
      children: [
        {
          name: "règles",
          topic: "Règles du cercle — à lire après acceptation.",
          memberOnly: true,
        },
        {
          name: "intros",
          topic: "Présente-toi : stack, focus IA/OSS, ce que tu partages.",
          memberOnly: true,
        },
        {
          name: "général",
          topic: "Discussion technique — harness, MCP, agents, stack.",
          memberOnly: true,
        },
        {
          name: "showcase",
          topic: "Ship, repos, demos, write-ups.",
          memberOnly: true,
        },
      ],
    },
    {
      name: "SUPPORT",
      type: GUILD_CATEGORY,
      children: [
        {
          name: "appeal",
          topic:
            "Cas edge (OSS surtout privé, faux négatif). Staff review — pas un second scoring chat.",
          memberOnly: false,
        },
      ],
    },
  ]

  const channels = await discord(token, "GET", `/guilds/${guildId}/channels`)
  /** @type {Map<string, any>} */
  const byName = new Map(channels.map((c) => [c.name, c]))

  const everyoneId = guildId // @everyone role id === guild id

  for (const cat of layout) {
    let parent = byName.get(cat.name)
    if (!parent) {
      if (dryRun) {
        console.log(`[dry-run] create category ${cat.name}`)
        parent = { id: "dry", name: cat.name }
      } else {
        parent = await discord(token, "POST", `/guilds/${guildId}/channels`, {
          name: cat.name,
          type: GUILD_CATEGORY,
          reason: "Roxabi Circle setup",
        })
        byName.set(cat.name, parent)
        console.log(`created category ${cat.name}`)
      }
    } else {
      console.log(`category exists ${cat.name}`)
    }

    for (const ch of cat.children ?? []) {
      let existing = byName.get(ch.name)
      // prefer text channel under this category if duplicates
      if (existing && existing.type !== GUILD_TEXT) {
        existing = channels.find(
          (c) => c.name === ch.name && c.type === GUILD_TEXT,
        )
      }

      /** @type {any[]} */
      const overwrites = []
      if (ch.memberOnly && memberRole?.id) {
        // VIEW_CHANNEL=1024, SEND_MESSAGES=2048, EMBED_LINKS=16384, READ_MESSAGE_HISTORY=65536
        // MANAGE_MESSAGES=8192 — bot needs explicit allow when @everyone is denied VIEW
        overwrites.push({
          id: everyoneId,
          type: 0,
          deny: String(1024),
          allow: "0",
        })
        overwrites.push({
          id: memberRole.id,
          type: 0,
          allow: String(1024 + 2048 + 65536 + 16384),
          deny: "0",
        })
        if (managedBotRole?.id) {
          overwrites.push({
            id: managedBotRole.id,
            type: 0,
            allow: String(1024 + 2048 + 65536 + 16384 + 8192),
            deny: "0",
          })
        }
      }

      if (!existing) {
        if (dryRun) {
          console.log(`[dry-run] create #${ch.name} under ${cat.name}`)
        } else {
          const created = await discord(
            token,
            "POST",
            `/guilds/${guildId}/channels`,
            {
              name: ch.name,
              type: GUILD_TEXT,
              parent_id: parent.id === "dry" ? undefined : parent.id,
              topic: ch.topic ?? "",
              permission_overwrites: overwrites.length ? overwrites : undefined,
              reason: "Roxabi Circle setup",
            },
          )
          byName.set(ch.name, created)
          console.log(`created #${ch.name}`)
        }
      } else {
        console.log(`channel exists #${ch.name}`)
        if (!dryRun && overwrites.length && memberRole?.id) {
          try {
            await discord(token, "PATCH", `/channels/${existing.id}`, {
              parent_id: parent.id === "dry" ? existing.parent_id : parent.id,
              topic: ch.topic ?? existing.topic,
              permission_overwrites: overwrites,
            })
            console.log(`  updated overwrites/topic #${ch.name}`)
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
  const commands = await discord(
    token,
    "GET",
    `/applications/${appId}/guilds/${guildId}/commands`,
  )
  const applyCmd = {
    name: "apply",
    description: "Candidater au Roxabi Circle (lien GitHub OAuth + consignes PR).",
    type: 1,
    dm_permission: false,
  }
  const existingCmd = Array.isArray(commands)
    ? commands.find((c) => c.name === "apply")
    : null

  if (dryRun) {
    console.log("[dry-run] would upsert guild command /apply")
  } else if (existingCmd) {
    await discord(
      token,
      "PATCH",
      `/applications/${appId}/guilds/${guildId}/commands/${existingCmd.id}`,
      applyCmd,
    )
    console.log(`updated guild command /apply id=${existingCmd.id}`)
  } else {
    const created = await discord(
      token,
      "POST",
      `/applications/${appId}/guilds/${guildId}/commands`,
      applyCmd,
    )
    console.log(`created guild command /apply id=${created.id}`)
  }

  // Pin welcome in #accueil if we can post
  if (!dryRun) {
    const accueil = byName.get("accueil")
    if (accueil?.id && accueil.id !== "dry") {
      try {
        await discord(token, "POST", `/channels/${accueil.id}/messages`, {
          content: [
            "## Roxabi Circle",
            "Cercle fermé — IA + open source. Pas de hype touriste.",
            "",
            "**Entrée**",
            "1. `/apply` — OAuth GitHub",
            "2. PR d’entrée sur le repo dédié (unlock scoring)",
            "3. Score auto → rôle `member` ou refus + cooldown",
            "",
            "Après accept : lis **#règles**, présente-toi dans **#intros**.",
            "Cas edge (OSS surtout privé) → **#appeal**.",
            "",
            `_Bot: ${me.username} · scorer open source dans le monorepo_`,
          ].join("\n"),
        })
        console.log("posted welcome in #accueil")
      } catch (e) {
        console.warn(
          "could not post welcome (Send Messages?):",
          // @ts-expect-error
          e.body ?? e.message,
        )
      }
    }
  }

  console.log("\n=== setup done ===")
  if (memberRole?.id) console.log(`DISCORD_MEMBER_ROLE_ID=${memberRole.id}`)
  console.log(
    "Next: set Interactions Endpoint URL after Worker deploy:",
    "https://circle.roxabi.dev/interactions",
  )
  console.log(
    "Rotate bot token if it was ever pasted in chat (Developer Portal → Reset Token).",
  )
}

main().catch((e) => {
  console.error(e.message)
  if (e.body) console.error(JSON.stringify(e.body, null, 2))
  process.exit(1)
})
