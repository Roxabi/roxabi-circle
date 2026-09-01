# Runbook — Discord Roxabi Circle

## Live state (2026-08-10)

| Item | Value |
|---|---|
| Server | **Circle by Roxabi_** |
| Invite | https://discord.gg/W6HjAQ5q |
| Guild ID | `1534225455144636526` |
| Application ID | `1534228521420067046` |
| Bot | **Lyra** (role Admin = `permissions=8`) |
| Member role | `member` → id `1534233545453604906` |
| Hierarchy | **Lyra** (pos 2) > **member** (pos 1) > `@everyone` |
| Slash | `/apply` (guild) · appeal button / `/appeal` |
| BW item | `roxabi-circle/discord` |
| Local secrets | `apps/circle-api/.dev.vars` (gitignored · bot token = **DUMMY** local) |
| CF account | **Mickael** `b5e90be9…` (zone `roxabi.dev`) — **not** Tool@gosilex |
| Public host | `https://circle.roxabi.dev` |
| Setup script | `bun apps/circle-api/scripts/discord-guild-setup.mjs` |

### Channels (live layout)

| Category | Channels | Who sees |
|---|---|---|
| **ENTRÉE** | `#règles` · `#arrivées` · `#intros` | Public: règles + arrivées only · Members: + intros |
| **CERCLE** | `#general` · `#daily-digest` · `#ai-agentic-workflow` · `#dev-with-ai` · `#news-actu` · `#github-to-watch` · `#showcase` · `#opportunités` | **Members only** (category SSoT) |
| **SUPPORT** | `#idées-améliorations` · `#appeal` | Members: idées · Non-members: appeal hub · Members **hidden** from `#appeal` |
| **VOIX** | hub `➕ créer un salon` (temp rooms) | **Members only** |
| **TICKETS** | *(empty — private `appeal-{userId}` only)* | **Hidden** from @everyone + member · bot + ticket author only |

> There is **no** `#accueil` / `#apply-help`. Onboarding copy lives in `#règles` + `/apply`.

---

## Permission model (normative)

### Who can see what

| Audience | Access |
|---|---|
| **@everyone** (visitor) | `#règles` (read) · `#arrivées` (read, no react) · `#appeal` (read + open ticket button) |
| **member** | Everything under **CERCLE** + **VOIX** + `#intros` + `#idées-améliorations` · **not** `#appeal` · **not** other people’s tickets |
| **Ticket opener** (non-member) | Own private channel `appeal-{discordUserId}` under **TICKETS** only |
| **Lyra** (Admin) | All |

### CERCLE — category is SSoT (Discord “Synced”)

Discord marks a channel **Synced with category** only when its `permission_overwrites`
are **identical** to the category’s (same roles + allow/deny).  
An **empty** overwrite list is **not** “Synced” in the UI (even if calc still falls back to the category).

| Channel | Discord overwrites | Behaviour |
|---|---|---|
| All CERCLE children | **Copy of category** (3 roles) | Full text · UI shows **Synced** |
| `#github-to-watch` | same (synced) | Gateway: **1 GitHub URL** top-level + auto-thread |
| `#news-actu` | same (synced) | Gateway: **1 http(s) URL** top-level + auto-thread |
| `#daily-digest` | same (synced) | Gateway: **bots only** top-level + auto-thread (humans → thread) |

To re-sync after drift: run setup with `--apply-perms` (copies category overwrites onto each `inherit` / `linksTopLevel` child).

### ENTRÉE

| Channel | Mode |
|---|---|
| Category | Default **deny VIEW** for `@everyone` (public channels re-allow) |
| `#règles` | public read-only (VIEW + HISTORY) |
| `#arrivées` | public read-only silent (no send/react/app commands) |
| `#intros` | **member** text only |

### SUPPORT + tickets

| Surface | Mode |
|---|---|
| `#idées-améliorations` | member text |
| `#appeal` | **Non-members** VIEW+HISTORY · deny send (button only) · **`member` deny VIEW** |
| **TICKETS** category | `@everyone` + `member` **deny VIEW** · Lyra manage |
| `appeal-{userId}` | created by Worker: everyone deny VIEW · author allow VIEW+SEND · 1 max · non-members only |

---

#### VOIX — temp rooms (Gateway)

| Item | Detail |
|---|---|
| Hub | `➕ créer un salon` (`DISCORD_VOICE_HUB_CHANNEL_ID`) |
| Parent | category **VOIX** (`DISCORD_VOICE_CATEGORY_ID`) |
| Flow | Join hub → Lyra creates `🔊 {displayName}` under VOIX → moves user · empty room → delete |
| Perms room | `member`: VIEW · CONNECT · SPEAK · STREAM · USE_VAD · text-in-voice · creator manage bits |
| Intent | `GUILD_VOICE_STATES` + `GUILDS` on Gateway DO |

---

### Secrets (BW)

```bash
source ~/projects/security/vaultwarden/scripts/agent-bw-login.sh
bw get notes "roxabi-circle/discord"
```

Keys: `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_MEMBER_ROLE_ID`, `DISCORD_APPEAL_CATEGORY_ID` (**TICKETS**), `DISCORD_APPEAL_CHANNEL_ID` (`#appeal`), `DISCORD_GITHUB_WATCH_CHANNEL_ID`, `DISCORD_NEWS_ACTU_CHANNEL_ID`, `DISCORD_DAILY_DIGEST_CHANNEL_ID`, `DISCORD_VOICE_HUB_CHANNEL_ID`, `DISCORD_VOICE_CATEGORY_ID`, `GATEWAY_OPS_SECRET`, `LYRA_GROK_WEBHOOK_URL` (optional; empty = no-op).

**Rotate** bot token if it was ever pasted in chat (Portal → Bot → Reset Token), then update BW + CF secret (local `.dev.vars` keeps DUMMY).

### Bot / intents

1. https://discord.com/developers/applications/1534228521420067046/bot  
2. **Message Content Intent** — required for `#github-to-watch` / `#news-actu`  
3. **Server Members Intent** if listing all members  
4. Save  

Admin re-invite (current):

```text
https://discord.com/api/oauth2/authorize?client_id=1534228521420067046&permissions=8&scope=bot%20applications.commands&guild_id=1534225455144636526&disable_guild_select=true
```

### Gateway bot (links top-level)

| Item | Detail |
|---|---|
| Runtime | Durable Object `DiscordGateway` |
| Wake | DO alarm · cron `*/15` · `POST /internal/discord-gateway/ensure` (+ `?force=1` after token rotate) · **not** `/health` |
| Env | `DISCORD_GITHUB_WATCH_CHANNEL_ID` · `DISCORD_NEWS_ACTU_CHANNEL_ID` · `DISCORD_DAILY_DIGEST_CHANNEL_ID` · `LYRA_GROK_WEBHOOK_URL` (optional) |
| `#github-to-watch` / `#news-actu` | Exactly **one** URL (GitHub vs any http(s)) · caption ≤120 · thread |
| `#daily-digest` | **Bot/webhook only** top-level · humans deleted · thread under digest |
| `@Lyra` mention | Same Gateway DO (`MESSAGE_CREATE`) · member role **or** guild admin/owner · fire-and-forget POST to `LYRA_GROK_WEBHOOK_URL` · **no** Discord reply · **no** second Gateway |
| GitHub digest | Cron **12:30 Europe/Paris** (`30 10` + `30 11` UTC) · trending daily+weekly · no embeds |
| On accept | Public thread under the message |
| On reject | Delete · notice ~12s · DM best-effort |
| Ignore | other channels, thread messages (different channel id) |

---

## Worker wiring

| Endpoint | Status |
|---|---|
| **Host** | `https://circle.roxabi.dev` |
| `POST /interactions` | Ed25519 · PING · `/apply` · appeal |
| `GET /health` | liveness only (no Gateway wake) |
| Gateway DO | MESSAGE_CREATE → github-watch / news-actu / daily-digest / @Lyra webhook · VOICE_STATE → temp rooms |
| `POST /internal/discord-gateway/ensure` | auth `X-Ops-Secret` |
| `POST /internal/github-digest` | auth `X-Ops-Secret` · run digest now (skip 12:30 gate) |

## Setup script (safe by default)

```bash
# inventory + /apply upsert + print env IDs (no channel create, no perm rewrite)
bun apps/circle-api/scripts/discord-guild-setup.mjs

# optional (explicit)
bun apps/circle-api/scripts/discord-guild-setup.mjs --dry-run
bun apps/circle-api/scripts/discord-guild-setup.mjs --create-missing   # create missing cats/channels only
bun apps/circle-api/scripts/discord-guild-setup.mjs --apply-perms      # rewrite overwrites to layout SSoT
```

**Do not** run `--create-missing` / `--apply-perms` on a live guild without reviewing the layout in the script first.

Real bot token: pull from BW into the shell env (never commit). Local `.dev.vars` may keep `DISCORD_BOT_TOKEN=DUMMY`.

## Still manual / product

1. Contenu exact `#règles` / `#intros`  
2. GitHub OAuth App + entry PR repo  
3. Deploy Worker + Interactions Endpoint  
4. Token rotation if leaked  
