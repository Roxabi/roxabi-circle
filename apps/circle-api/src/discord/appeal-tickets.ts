/**
 * Appeal tickets — 1 open ticket max, non-members only.
 * Channel name convention: appeal-{discordUserId}
 */

export const APPEAL_OPEN_BUTTON = 'appeal:open'
/** Prefix — full id is appeal:close:{discordUserId} */
export const APPEAL_CLOSE_PREFIX = 'appeal:close:'
export const APPEAL_CHANNEL_PREFIX = 'appeal-'

export function appealCloseCustomId(discordUserId: string): string {
  return `${APPEAL_CLOSE_PREFIX}${discordUserId}`
}

export function parseAppealCloseUserId(customId: string): string | null {
  if (!customId.startsWith(APPEAL_CLOSE_PREFIX)) return null
  const id = customId.slice(APPEAL_CLOSE_PREFIX.length)
  return /^\d{5,30}$/.test(id) ? id : null
}

export type TicketDecision =
  | { ok: true }
  | { ok: false; code: 'is_member' | 'already_open'; message: string }

/** Pure gate used by the interaction handler (unit-tested). */
export function decideTicketOpen(input: {
  isMember: boolean
  existingTicketChannelId: string | null
}): TicketDecision {
  if (input.isMember) {
    return {
      ok: false,
      code: 'is_member',
      message:
        'Tu as déjà le rôle **member** — les tickets appeal sont réservés aux non-membres (cas edge OSS / faux négatif).',
    }
  }
  if (input.existingTicketChannelId) {
    return {
      ok: false,
      code: 'already_open',
      message: `Tu as déjà un ticket ouvert : <#${input.existingTicketChannelId}>. **1 ticket max** — ferme-le avant d’en ouvrir un autre.`,
    }
  }
  return { ok: true }
}

export function ticketChannelName(discordUserId: string): string {
  // Discord channel names: lowercase, digits, hyphen
  return `${APPEAL_CHANNEL_PREFIX}${discordUserId}`
}

export function parseTicketUserIdFromChannelName(name: string): string | null {
  if (!name.startsWith(APPEAL_CHANNEL_PREFIX)) return null
  const id = name.slice(APPEAL_CHANNEL_PREFIX.length)
  return /^\d{5,30}$/.test(id) ? id : null
}

const API = 'https://discord.com/api/v10'

// Permission bits
const VIEW = 1 << 10
const SEND = 1 << 11
const MANAGE_MSG = 1 << 13
const EMBED = 1 << 14
const ATTACH = 1 << 15
const HISTORY = 1 << 16
const REACT = 1 << 6

const USER_TICKET = VIEW | SEND | EMBED | ATTACH | HISTORY | REACT
const BOT_TICKET = USER_TICKET | MANAGE_MSG

async function discord<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'RoxabiCircle (appeal-tickets, 0.1)',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data: T = null as T
  if (text) {
    try {
      data = JSON.parse(text) as T
    } catch {
      data = { raw: text } as T
    }
  }
  return { status: res.status, data }
}

type GuildChannel = {
  id: string
  name: string
  type: number
  parent_id?: string | null
  topic?: string | null
}

export async function findOpenTicketChannel(
  token: string,
  guildId: string,
  discordUserId: string,
): Promise<GuildChannel | null> {
  const { status, data } = await discord<GuildChannel[]>(
    token,
    'GET',
    `/guilds/${guildId}/channels`,
  )
  if (status !== 200 || !Array.isArray(data)) return null
  const want = ticketChannelName(discordUserId)
  return data.find((c) => c.type === 0 && c.name === want) ?? null
}

export async function createAppealTicket(input: {
  token: string
  guildId: string
  categoryId: string
  discordUserId: string
  username: string
}): Promise<{ channelId: string } | { error: string }> {
  const name = ticketChannelName(input.discordUserId)
  const everyone = input.guildId

  const { status, data } = await discord<GuildChannel & { message?: string }>(
    input.token,
    'POST',
    `/guilds/${input.guildId}/channels`,
    {
      name,
      type: 0,
      parent_id: input.categoryId,
      topic: `Appeal ticket — user ${input.discordUserId} (@${input.username}) — 1 max`,
      permission_overwrites: [
        { id: everyone, type: 0, allow: '0', deny: String(VIEW) },
        {
          id: input.discordUserId,
          type: 1, // member
          allow: String(USER_TICKET),
          deny: '0',
        },
        // bot role is not the bot user — bot user still needs access via admin role.
        // Explicit bot user overwrite is not valid; bot with Admin sees all.
      ],
      reason: `Appeal ticket for ${input.discordUserId}`,
    },
  )

  if (status !== 200 && status !== 201) {
    return {
      error: `create_channel_${status}: ${JSON.stringify(data).slice(0, 200)}`,
    }
  }

  const channelId = data.id

  // Welcome + close button
  await discord(input.token, 'POST', `/channels/${channelId}/messages`, {
    content: [
      `## Ticket appeal — <@${input.discordUserId}>`,
      '',
      'Explique ton **cas edge** (OSS surtout privé, faux négatif, compte atypique…).',
      'Un opérateur relira. Ce n’est **pas** un second scoring chat.',
      '',
      '**Règles**',
      '• **1 ticket max** par personne',
      '• Réservé aux **non-membres**',
      '• Ferme le ticket quand c’est réglé (bouton ci-dessous)',
    ].join('\n'),
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 4, // danger
            label: 'Fermer le ticket',
            custom_id: appealCloseCustomId(input.discordUserId),
          },
        ],
      },
    ],
  })

  return { channelId }
}

export async function closeAppealTicket(input: {
  token: string
  channelId: string
  ownerId: string
  actorId: string
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (input.ownerId !== input.actorId) {
    return {
      ok: false,
      message:
        'Seul l’auteur du ticket peut le fermer via ce bouton (staff : supprimer le salon).',
    }
  }

  await discord(input.token, 'POST', `/channels/${input.channelId}/messages`, {
    content: `_Ticket fermé par <@${input.actorId}>. Suppression…_`,
  })

  const { status, data } = await discord(
    input.token,
    'DELETE',
    `/channels/${input.channelId}`,
  )
  if (status !== 200 && status !== 204) {
    return {
      ok: false,
      message: `Échec suppression (${status}): ${JSON.stringify(data).slice(0, 120)}`,
    }
  }
  return { ok: true }
}
