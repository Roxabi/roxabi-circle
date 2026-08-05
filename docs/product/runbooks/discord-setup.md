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
| CF account | **Mickael** `b5e90be9…` (zone `roxabi.dev`) — **not** Tool@gosilex |
| Public host | `https://circle.roxabi.dev` (`workers_dev = false`) |
| Setup script | `bun scripts/discord-guild-setup.mjs` (idempotent) |

### Channels

| Category | Channels |
|---|---|
| **ENTRÉE** | `#accueil`, `#apply-help` (+ `#règles` / `#intros` si présents) |
| **CERCLE** (member-only, SSoT perms) | see table below |
| **SUPPORT** | `#appeal`, `#idées-améliorations` |

#### CERCLE permission model

| Channel | Mode | Members |
|---|---|---|
| `#general`, `#ai-agentic-workflow`, `#dev-with-ai`, `#showcase`, `#opportunités` | **inherit** | Full text (view/send/attach/react/threads) from category |
| `#daily-digest` | **threadOnly** | No top-level `SEND` · react · create public threads · send **in** threads · Lyra posts digests |
| `#github-to-watch` | **linksTopLevel** | Can post top-level · **Lyra Gateway** enforces **exactly 1 GitHub URL** (+ caption ≤120) · else delete + notice · on OK opens discussion thread |

Category **CERCLE** deny `@everyone` VIEW; allow `member` + **Lyra**. Special channels override only the bits they need (e.g. deny `SEND` on digest).

### Secrets (BW)

```bash
source ~/projects/security/vaultwarden/scripts/agent-bw-login.sh
bw get notes "roxabi-circle/discord"
```

Keys: `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_MEMBER_ROLE_ID`, `DISCORD_APPEAL_CATEGORY_ID`, `DISCORD_GITHUB_WATCH_CHANNEL_ID`, `GATEWAY_OPS_SECRET`.

**Rotate** bot token if it was ever pasted in chat (Portal → Bot → Reset Token), then update BW + `.dev.vars`.

### Bot permissions

Scopes: `bot`, `applications.commands`  
Bits (target least-privilege): Manage Roles, Manage Channels, Send Messages, Embed Links, Send Messages in Threads, Use Application Commands (`71135414288`).

Member-only **category CERCLE** is the SSoT: deny `@everyone` VIEW; allow `member` (view + send + attach + history + reactions + public threads + send-in-threads + app commands) and bot **Lyra** (+ manage messages/channels/threads). Open children **inherit** (empty channel overwrites). Exceptions: `#daily-digest` (threadOnly), `#github-to-watch` (linksTopLevel + Gateway bot).

**Administrator (2026-08-04):** bot role **Lyra** = `permissions=8` (full Admin).  
Re-invite if needed:

```text
https://discord.com/api/oauth2/authorize?client_id=1534228521420067046&permissions=8&scope=bot%20applications.commands&guild_id=1534225455144636526&disable_guild_select=true
```

**Developer Portal intents** (not the same as Admin):

1. https://discord.com/developers/applications/1534228521420067046/bot  
2. Enable **Message Content Intent** — **required** for `#github-to-watch` Gateway handler (without it, content is empty → false rejects).  
3. Enable **Server Members Intent** if you list all members (50001 otherwise; per-id search still works).  
4. Save.

### Gateway bot (`#github-to-watch`)

| Item | Detail |
|---|---|
| Runtime | Durable Object `DiscordGateway` (outgoing WS to Discord Gateway) |
| Wake | Cron `*/2 * * * *` + `/health` best-effort + `POST /internal/discord-gateway/ensure` |
| Env | `DISCORD_GITHUB_WATCH_CHANNEL_ID` |
| Accept | Exactly **one** `github.com` / `gist.github.com` URL; optional caption ≤120 chars |
| On accept | Create public thread under the message (name from owner/repo) |
| On reject | Delete message · short channel notice (auto-delete ~12s) · DM best-effort |
| Ignore | bots, webhooks, other channels, thread messages (different channel id) |

Re-invite (least privilege):

```text
https://discord.com/api/oauth2/authorize?client_id=1534228521420067046&permissions=71135414288&scope=bot%20applications.commands&guild_id=1534225455144636526&disable_guild_select=true
```

## Worker wiring

| Endpoint | Status |
|---|---|
| **Host** | `https://circle.roxabi.dev` (`workers_dev = false`) |
| `POST /interactions` | Ed25519 verify + PING + `/apply` scaffold |
| `GET /health` | public · wakes Gateway best-effort |
| Gateway DO | MESSAGE_CREATE → github-watch enforce · cron `*/2` |
| `POST /internal/discord-gateway/ensure` | **auth** header `X-Ops-Secret: $GATEWAY_OPS_SECRET` |
| `GET /oauth/github/*` | 501 not implemented |
| Catch-all | **404** |
| Interactions URL in Portal | **`https://circle.roxabi.dev/interactions`** |

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
