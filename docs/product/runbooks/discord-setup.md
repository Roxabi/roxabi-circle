# Runbook — Discord Roxabi Circle

## Live state (2026-08-04)

| Item | Value |
|---|---|
| Server | **Circle by Roxabi_** |
| Invite | https://discord.gg/W6HjAQ5q |
| Guild ID | `1534225455144636526` |
| Application ID | `1534228521420067046` |
| Bot | **Lyra** |
| Member role | `member` → id `1534233545453604906` |
| Hierarchy | role bot **Lyra** (pos 2) > **member** (pos 1) |
| Slash | `/apply` (guild command) |
| BW item | `roxabi-circle/discord` |
| Local secrets | `apps/circle-api/.dev.vars` (gitignored) |
| Setup script | `bun scripts/discord-guild-setup.mjs` (idempotent) |

### Channels

| Category | Channels |
|---|---|
| **ENTRÉE** | `#accueil`, `#github-to-watch`, `#apply-help` |
| **CERCLE** (member-only view) | `#règles`, `#intros`, `#général`, `#showcase` |
| **SUPPORT** | `#appeal` |
| Legacy (pre-setup) | `#general`, `#présentation`, `#ai-agentic`, `#dev-with-ai`, `#idées-améliorations` under *Text Channels* |

Clean up / merge legacy salons when ready (manual product call).

### Secrets (BW)

```bash
source ~/projects/security/vaultwarden/scripts/agent-bw-login.sh
bw get notes "roxabi-circle/discord"
```

Keys: `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_MEMBER_ROLE_ID`.

**Rotate** bot token if it was ever pasted in chat (Portal → Bot → Reset Token), then update BW + `.dev.vars`.

### Bot permissions

Scopes: `bot`, `applications.commands`  
Bits (target least-privilege): Manage Roles, Manage Channels, Send Messages, Embed Links, Send Messages in Threads, Use Application Commands (`71135414288`).

Member-only channels (`#règles`, `#intros`, `#général`, `#showcase`) deny `@everyone` VIEW and allow:
- role `member`
- role bot **Lyra** (explicit — otherwise bot locks itself out)

**Administrator (2026-08-04):** bot role **Lyra** = `permissions=8` (full Admin).  
Re-invite if needed:

```text
https://discord.com/api/oauth2/authorize?client_id=1534228521420067046&permissions=8&scope=bot%20applications.commands&guild_id=1534225455144636526&disable_guild_select=true
```

**Developer Portal intents** (not the same as Admin — required for `GET /guilds/.../members`):

1. https://discord.com/developers/applications/1534228521420067046/bot  
2. Enable **Server Members Intent** (and Message Content later if gateway).  
3. Save. Without this, list-all-members returns 50001; member search / per-id still work.

Re-invite (least privilege):

```text
https://discord.com/api/oauth2/authorize?client_id=1534228521420067046&permissions=71135414288&scope=bot%20applications.commands&guild_id=1534225455144636526&disable_guild_select=true
```

## Worker wiring

| Endpoint | Status |
|---|---|
| `POST /interactions` | Ed25519 verify + PING + `/apply` scaffold |
| `GET /oauth/github/*` | not implemented |
| Interactions URL in Portal | set **after** deploy: `https://circle.roxabi.dev/interactions` |

```bash
# local
cd apps/circle-api && bun run dev
# then tunnel / workers.dev URL into Portal Interactions Endpoint for PING check
```

Discord saves the Interactions URL only if PING → PONG (signature OK).

## Re-run setup

```bash
bun scripts/discord-guild-setup.mjs
# bun scripts/discord-guild-setup.mjs --dry-run
```

Creates missing role/channels/command; updates `DISCORD_MEMBER_ROLE_ID` in `.dev.vars`.

## Still manual / product

1. Contenu exact `#règles` / `#intros` (O2)
2. Merge or archive legacy Text Channels
3. GitHub OAuth App + D11 repo d’entrée
4. Deploy Worker + set Interactions Endpoint
5. Token rotation post-leak chat
6. Optional: staff role + `#appeal` overwrites
