/**
 * Discord interactions router.
 * PING · /apply scaffold · appeal ticket buttons.
 */

import type { Env } from '../types'
import {
  APPEAL_CLOSE_PREFIX,
  APPEAL_OPEN_BUTTON,
  closeAppealTicket,
  createAppealTicket,
  decideTicketOpen,
  findOpenTicketChannel,
  parseAppealCloseUserId,
} from './appeal-tickets'
import { verifyDiscordRequest } from './verify'

const PING = 1
const APPLICATION_COMMAND = 2
const MESSAGE_COMPONENT = 3

const PONG = 1
const CHANNEL_MESSAGE = 4

const EPHEMERAL = 1 << 6

type DiscordInteraction = {
  type: number
  id?: string
  token?: string
  data?: {
    name?: string
    custom_id?: string
    id?: string
  }
  member?: {
    user?: { id?: string; username?: string; global_name?: string | null }
    roles?: string[]
  }
  user?: { id?: string; username?: string; global_name?: string | null }
  channel_id?: string
  channel?: { id?: string; name?: string }
  guild_id?: string
  message?: { id?: string }
}

function actor(interaction: DiscordInteraction): {
  id: string
  username: string
  roles: string[]
} {
  const u = interaction.member?.user ?? interaction.user
  return {
    id: u?.id ?? '',
    username: u?.global_name || u?.username || 'user',
    roles: interaction.member?.roles ?? [],
  }
}

function ephemeral(content: string) {
  return Response.json({
    type: CHANNEL_MESSAGE,
    data: { flags: EPHEMERAL, content },
  })
}

export async function handleDiscordInteractions(request: Request, env: Env): Promise<Response> {
  const verified = await verifyDiscordRequest(request, env.DISCORD_PUBLIC_KEY)
  if (!verified.ok) {
    return new Response('invalid request signature', { status: verified.status })
  }

  let interaction: DiscordInteraction
  try {
    interaction = JSON.parse(verified.body) as DiscordInteraction
  } catch {
    return new Response('bad json', { status: 400 })
  }

  if (interaction.type === PING) {
    return Response.json({ type: PONG })
  }

  if (interaction.type === APPLICATION_COMMAND) {
    const name = interaction.data?.name
    if (name === 'apply') {
      return Response.json({
        type: CHANNEL_MESSAGE,
        data: {
          flags: EPHEMERAL,
          content: [
            '**Roxabi Circle — candidature**',
            '',
            'Le bot est branché ✅ — le flux OAuth GitHub + PR d’entrée arrive ensuite.',
            '',
            'En attendant :',
            '• lis le monorepo (scorer open source)',
            '• prépare un profil GitHub public actif',
            '• cas edge → bouton **Ouvrir un ticket** dans **#appeal**',
          ].join('\n'),
        },
      })
    }
    if (name === 'appeal') {
      // Same as button — open ticket
      return openTicketFromInteraction(interaction, env)
    }
    return ephemeral(`Commande inconnue : \`${name ?? '?'}\``)
  }

  if (interaction.type === MESSAGE_COMPONENT) {
    const customId = interaction.data?.custom_id
    if (customId === APPEAL_OPEN_BUTTON) {
      return openTicketFromInteraction(interaction, env)
    }
    if (customId?.startsWith(APPEAL_CLOSE_PREFIX)) {
      return closeTicketFromInteraction(interaction, env, customId)
    }
    return ephemeral('Bouton inconnu.')
  }

  return Response.json({ error: 'unsupported_interaction' }, { status: 400 })
}

async function openTicketFromInteraction(
  interaction: DiscordInteraction,
  env: Env,
): Promise<Response> {
  const { id, username, roles } = actor(interaction)
  if (!id) return ephemeral('Utilisateur introuvable.')

  const isMember = roles.includes(env.DISCORD_MEMBER_ROLE_ID)
  const existing = await findOpenTicketChannel(env.DISCORD_BOT_TOKEN, env.DISCORD_GUILD_ID, id)
  const decision = decideTicketOpen({
    isMember,
    existingTicketChannelId: existing?.id ?? null,
  })
  if (!decision.ok) return ephemeral(decision.message)

  const categoryId = env.DISCORD_APPEAL_CATEGORY_ID
  if (!categoryId) {
    return ephemeral('Config manquante : `DISCORD_APPEAL_CATEGORY_ID` (catégorie des tickets).')
  }

  const created = await createAppealTicket({
    token: env.DISCORD_BOT_TOKEN,
    guildId: env.DISCORD_GUILD_ID,
    categoryId,
    discordUserId: id,
    username,
  })

  if ('error' in created) {
    return ephemeral(`Échec création ticket : \`${created.error}\``)
  }

  return ephemeral(
    `Ticket créé : <#${created.channelId}>. **1 ticket max** — décris ton cas edge là-bas.`,
  )
}

async function closeTicketFromInteraction(
  interaction: DiscordInteraction,
  env: Env,
  customId: string,
): Promise<Response> {
  const { id } = actor(interaction)
  const channelId = interaction.channel_id ?? interaction.channel?.id
  if (!channelId) return ephemeral('Salon introuvable.')

  const ownerId = parseAppealCloseUserId(customId)
  if (!ownerId) return ephemeral('Bouton invalide.')

  const result = await closeAppealTicket({
    token: env.DISCORD_BOT_TOKEN,
    channelId,
    ownerId,
    actorId: id,
  })

  if (!result.ok) return ephemeral(result.message)

  // Channel is deleted — ephemeral is safer than UPDATE_MESSAGE
  return ephemeral('Ticket fermé et salon supprimé. Tu pourras en rouvrir un si besoin.')
}
