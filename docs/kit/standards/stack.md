# Stack normative du kit

> **Autorité :** ce document porte les choix de stack, leurs contraintes et leur rationale.
> `.claude/stack.yml` n'en est que la projection machine (paths, commandes et pointeurs).
> Les changements structurants exigent aussi un ADR sous [`../architecture/adr/`](../architecture/adr/).

## Stack complète (figée 2026-07-12)

> **Cible kit** = tableaux. **Scaffold** = colonne « Quand » / priorité.  
> Bun + Turbo comme operator · Hono Workers · TanStack SPA · FastMCP · Better Auth cookies · erreurs centralisées · i18n FR.

### Principe

```text
API (Hono Worker)     = contrat unique pour web + MCP + skill
UI (Vite SPA TanStack)= client HTTP + cookies session
MCP                   = FastMCP (ou SDK) → même auth sk_ / même services
packages/*            = kit (0 string métier share)
apps/share-*          = produit (exclu à l’extraction)
```

**shadcn (juil. 2026) :** default primitives = **Base UI** (`@base-ui/react`). Pin un engine dans `components.json`.  
Ref : [changelog Base UI default](https://ui.shadcn.com/docs/kit/changelog/2026-07-base-ui-default)

---

### A. Runtime & monorepo

| Couche | Choix | Quand |
|---|---|---|
| Language | **TypeScript 7+ strict** | S0 |
| Package manager | **Bun** workspaces (`bun.lock`) | S0 |
| Task runner | **Turborepo** (cache, filter, affected) — *pas* remplacé par Bun | S0 |
| Edge | **Cloudflare Workers** | S0 |
| API | **Hono 4** | S0 |
| Validation | **Zod 4** (+ env schemas) | S0 |
| ORM | **Drizzle** + **D1** | S0 |
| Bytes | **R2** | S0 |
| Jobs | **CF Queues** + **Cron** | M3+ |
| Deploy | **Wrangler 4** · CD pull post-CI | S0 |
| Types CF | `wrangler types` | S0 |
| Secrets | CF secrets + Vaultwarden | S0 |

Escape hatch : Postgres/Hyperdrive si un app dépasse D1 — documenté, pas default.

---

### B. Frontend (TanStack-centric)

| Couche | Choix | Quand |
|---|---|---|
| React **19** + **Vite** | SPA sur Workers assets / Pages | M3 |
| **TanStack Router** | routes + search params typés | M3 |
| **TanStack Query v5** | tout état serveur (pas `useEffect` fetch) | M3 |
| **TanStack Form** + Zod | forms | M3 |
| **TanStack Table** | listes admin selon [ADR-0010](../architecture/adr/0010-list-page-cursor-envelope.md) · **Virtual reste P1** | M3+ |
| **TanStack Pacer** | debounce search/upload | P1 |
| **TanStack Start** | **optionnel** SSR/marketing only | non default |
| TanStack DB / Store / Charts | non default (beta / alpha / deprecated) | — |
| **Tailwind v4** · **lucide** · **CVA** + clsx + tailwind-merge | style shadcn | M3 |

**CVA** = Class Variance Authority — variants type-safe des classes Tailwind (Button `variant`/`size`). Standard shadcn.

---

### C. UI — `packages/ui`

| | |
|---|---|
| **shadcn/ui** sources owned | Base UI default 2026 |
| Contenu kit | Button, Input, Field, Dialog, Sheet, Sidebar, Toast, Dropdown, Table shell, Form |
| Thème | CSS vars · light/dark · tokens Kit |
| Assets (ShipFast extras) | favicon, apple-icon, OG/twitter images, logo |
| **Interdit** | composants métier share |

---

### D. Auth + **cookies**

| Élément | Choix | Quand |
|---|---|---|
| Sessions UI (cible) | **Better Auth** sur **Hono** (GitHub + org membership) | **M3** |
| Sessions UI (**aujourd’hui**) | **Better Auth** cookies via `@kit/auth` SessionPort — [ADR-0002](../architecture/adr/0002-session-hmac-interim-vs-better-auth.md) (HMAC **retired**) | kit |
| API keys machine | `sk_…` hash en D1, **per-user** | B1+ bootstrap |
| Guards (kit) | Hono middleware dual-path `requireAuth` (Bearer **ou** cookie) dans `example-api` | B1+ |
| Guards (cible package) | `requireSession` / `requireApiKey` dans `@kit/auth` | M3 / promote |
| Recheck org | Cron ≤24h → revoke keys | M3 |

#### Cookies (obligatoire — sessions UI)

| Règle | Détail |
|---|---|
| Qui set | Better Auth handler `ALL /api/auth/*` → `Set-Cookie` |
| Attributs | **HttpOnly** · **Secure** (prod) · **SameSite=Lax** (ou `None`+Secure si cross-site strict) · `Path=/` |
| Domain | parent `.example.com` si SPA/API sous-domaines ≠ ; sinon **même host** (préféré M3) |
| Client fetch | **`credentials: 'include'`** sur apiClient central |
| CORS | si hosts séparés : `Allow-Credentials: true` + origin **explicite** (jamais `*`) |
| CSRF | SameSite + vérif Origin sur mutations |
| MCP / skill | **pas de cookies** → Bearer `sk_…` only |
| Helpers | `@kit/auth` cookie options env-aware · `hono/cookie` si besoin |

**Non-default :** Clerk.

**[ADR-0002](../architecture/adr/0002-session-hmac-interim-vs-better-auth.md) (2026-07-30) :** session navigateur = **Better Auth only** (HMAC retiré). Dual-path restant = cookie session **\|** Bearer `sk_`. Pattern : **1 instance auth / request** (bindings) + `SessionPort`.

#### Auth matrix (kit dogfood)

| Mode | Surface | Credential | Notes |
|------|---------|------------|--------|
| **Password** | `POST /api/auth/sign-in/email` · `/login` | email + password → **cookie** | default login tab |
| **Sign-up (opt-in)** | `POST /api/auth/sign-up/email` · `/sign-up` | email + password + name → **cookie** | SPA + BA only when `ALLOW_PUBLIC_SIGNUP=true` (`GET /health.allowPublicSignup` is UX); **default off** — forks opt in via product wrangler vars; CTA hidden + `/sign-up` → `/login` when off; failed sign-up 4xx → kit envelope (disabled 403, else generic 400, no existence leak) |
| **Magic link** | `POST /api/auth/sign-in/magic-link` · verify `GET /api/auth/magic-link/verify` · `/login` tab | one-shot email link (TTL **5 min**) → **cookie** | EmailPort template; `disableSignUp` = `!ALLOW_PUBLIC_SIGNUP` (default **off**); no user enumeration |
| **Forgot / reset** | request-password-reset · reset-password | email link → set password | EmailPort |
| **API key** | `Authorization: Bearer sk_…` | **no cookie** | MCP / machine; mint after session |
| OAuth Google/GitHub | — | product later | hors kit default |

---

### E. MCP

| | |
|---|---|
| **Préféré** | **[FastMCP](https://github.com/punkpeye/fastmcp)** (TS, ~3k★) — tools Zod, auth, OAuth 2.1, **EdgeFastMCP** Workers |
| **Alternative** | SDK officiel [`@modelcontextprotocol/typescript-sdk`](https://github.com/modelcontextprotocol/typescript-sdk) (~13k★) + thin wrapper |
| Package Kit | `@kit/mcp` = conventions (logging, sk_, registry) **autour** FastMCP ou SDK — pas un 3ᵉ framework inventé |
| Auth M5 frame | `sk_…` mint UI après OAuth ; pas d’OAuth interactif à chaque tool |
| OAuth remote MCP | FastMCP providers (GitHub…) si MCP public multi-clients plus tard |
| Transports | stdio first · HTTP streamable ensuite |
| Skill | thin HTTP client → API Hono |
| Example | `mcp-example` : `ping` / `whoami` only |
| Produit | `share-mcp` tools frame (M5) |

Autres étoiles (contexte, pas spine) : mcp-use (~10k), mcp-agent (~8k), openai-mcpkit (scaffold auth), FastMCP Python (autre runtime).

---

### F. Erreurs centralisées (FE + BE)

#### Backend — `@kit/core`

```text
AppError { code, status, message?, details?, cause? }
  → Hono onError middleware
    → log: requestId, code, stack/cause (interne)
    → JSON public: { error: { code, message }, requestId }
```

| Règle | |
|---|---|
| Codes | `SCREAMING_SNAKE` partagés (`SLUG_EXISTS`, `UNAUTHORIZED`, `VALIDATION_ERROR`…) |
| Client | message générique / i18n-ready — **jamais** stack, SQL, paths |
| Zod | → `VALIDATION_ERROR` + `fieldErrors?` |
| `private_key` bad | **404** (frame, no existence leak) |
| requestId | header + body |

#### Frontend

```text
ApiError { status, code, message, requestId, body }
  → apiErrorToMessage / toast / field errors / ErrorBoundary
```

| Surface | Comportement |
|---|---|
| TanStack Query | onError global + toast |
| Forms | map fieldErrors |
| Boundary | page d’erreur + CTA support (ShipFast-style mailto / chat) |
| 401 | clear session → login |

**Shared :** `ErrorCode` + type `ApiErrorBody` dans `@kit/types` ou `core` — une SSoT FE/BE.  
Ref pattern : `kit-boilerplate` (`errorCodes`, `errorUtils`, `ApiError`).

---

### G. i18n (multilang)

| | |
|---|---|
| Config | App `createI18n({ defaultLocale, catalogs })` — **catalog keys = locales** |
| Switcher | `@kit/ui` `LocaleSwitcher` — **hidden if `locales.length === 1`** |
| Kit dogfood | `example-web` **FR+EN** (switch on) |
| Product 1 langue | catalogs `{ fr }` only — no EN file, no switcher chrome |
| Tooling | Catalogs TS app-owned + `@kit/i18n` engine (live) · **Paraglide monorepo park** (B8) |
| Routing | path `/fr` `/en` **ou** locale cookie / `Accept-Language` (not implemented; storage key `kit.locale`) |
| Erreurs API | **codes stables** ; copy traduite **côté UI** (pas 12 langues hardcodées backend) |
| Emails | templates par locale (P1) |
| Package | `@kit/i18n` **live** (engine + `hasLocaleSwitcher` / `resolveLocale`) |

---

### H. Packages SaaS (carte)

| Package | Contenu | Prio |
|---|---|---|
| `@kit/core` | AppError, Result, IDs, requestId, env Zod | **P0** |
| `@kit/config` | tsconfig, Biome, Vitest presets | **P0** |
| `@kit/db` | Drizzle D1 + migrate | **P0** |
| `@kit/storage` | R2 put/get/presign | **P0** |
| `@kit/auth` | SessionPort + `sk_` + org-role helpers; BA factory `@kit/auth/factory`; SPA password forms `@kit/auth/react` (forgot / reset / change — pages stay in the app) ([ADR-0002](../architecture/adr/0002-session-hmac-interim-vs-better-auth.md) · [ADR-0003](../architecture/adr/0003-multi-tenant-rbac-modules.md) · [ADR-0008](../architecture/adr/0008-kit-schema-identity-product-compose.md) D6) | **P0** |
| `@kit/types` | Zod schemas + ErrorCode | **P0** |
| `@kit/api-client` | Browser `createApiClient` + `ApiError` + validation field-error helpers · `credentials: 'include'` default · i18n via app catalog in `apiErrorToMessage` | **P0** |
| `@kit/ui` | shadcn Base UI shell | **P0** |
| `@kit/email` | Templates + transports `log` \| `smtp` \| **`cf`** (prod default) \| `resend` (escape) — [ADR-0004](../architecture/adr/0004-email-transport-cf-default.md) | **P0** |
| `@kit/i18n` | Locale engine; catalogs app-owned; 1 catalog = no switcher | **P0** |
| `@kit/mcp` | FastMCP/SDK conventions (ping/whoami) · tools under grants when wired · **parity grant∩ with flows** | **P0** example |
| `@kit/flows` | Pure plan engine: YAML MVP · `check` · grant∩permits · snapshot helpers ([ADR-0005](../architecture/adr/0005-flows-platform-agentic-workflows.md) · #16 · #27–#28); Workflows/D1/API = children #29–#31 · promote **D6 only** | **P0** incubating |
| `@kit/tasks` | Pure task engine: stages · visibility · links · opaque scope · AudiencePort helpers ([ADR-0007](../architecture/adr/0007-tasks-comments-kernel.md)); D1/API dogfood later · **no resource links until resource system** | **P0** incubating |
| `@kit/comments` | Pure multi-target comments (`target_type`+`target_id`, visibility) — compose with tasks + product entities ([ADR-0007](../architecture/adr/0007-tasks-comments-kernel.md)) | **P0** incubating |
| *(no `@kit/agents` yet)* | Agent loop / code-mode → **after** flows runner evidence · optional future agents ADR · product code-mode only | blocked until D6 |
| `@kit/rate-limit` | D1/KV / CF binding | P1 |
| `@kit/audit` | append-only events | P1 |
| `@kit/jobs` | Queues/cron helpers | P1 |
| `@kit/observability` | logs + hooks Sentry/OTel | P1 |
| `@kit/billing` | Stripe stubs | **P2** hors share v1 |
| flags / webhooks | | P2 |

**Règle package :** 2 call sites **ou** ADR — pas de squelettes vides massifs.

---

### H2. Email — transport par environnement ([ADR-0004](../architecture/adr/0004-email-transport-cf-default.md))

| Env | Transport | UI / inspection |
|---|---|---|
| **local** | Worker = `log` (console redacted). SMTP → **Mailpit** = Node `@kit/email/server` only — **jamais** Worker (`assertEmailTransportAllowed`) | Console Worker · Mailpit `http://127.0.0.1:8025` (Node only) |
| **staging** | Worker = `cf` (preferred) **ou** `resend` ; allowlist + subject `[TEST STAGING]` + From `@example.com`. SMTP catcher = Node `@kit/email/server` only — **jamais** var Worker | Pas de spam client réel |
| **prod** | **`cf`** Cloudflare Email Sending binding (default) · `resend` escape hatch | Logs CF / provider — **pas** de catcher |

**Décision kit** (`@kit/email`, shipped #21) :

```text
EMAIL_TRANSPORT=log | smtp | cf | resend
# log  → development|test only (fail-closed elsewhere)
# cf   → Workers EMAIL binding (prod default)
# smtp → Mailpit — Node @kit/email/server only, never Worker (local or staging)
# resend → optional escape (RESEND_API_KEY)
```

- Templates kit : invite, reset-password, demo (copy FR-first).  
- **Jamais** `EMAIL_TRANSPORT=log` en staging/prod.  
- Compose local : service `mailpit` dans `docker-compose.yml` (SMTP 1025 · UI 8025) — **Node** `@kit/email/server` only, pas le path Worker / `wrangler`.

---

### I. Qualité, review, observabilité, analytics

#### DX / qualité code

| Outil | Choix | Quand |
|---|---|---|
| Lint/format | **Biome** | S0 |
| Tests | **Vitest** + `@cloudflare/vitest-pool-workers` | S0 |
| E2E | **Playwright** | P1 |
| Hooks | **Lefthook** (pre-commit Biome · **pre-push = validate:full** primary gate) + commitlint · CI = garde-fou | S0 |
| CI | GH Actions `bun run validate:full` (SSoT: root `package.json` script — do not copy the step list here) + secret-scan — **bloquant** | S0 |
| Security headers | HSTS, X-Frame-Options, nosniff, Referrer-Policy (ShipFast) | S0/M0 |
| Schema validation | Zod partout (ShipFast security) | S0 |

#### AI code review (PR)

| Option | Rôle | Reco Kit |
|---|---|---|
| **CodeRabbit** | review PR AI, Conventional Comments, ok monorepo | **P1 default** si budget — déjà cité ShipFast/ixartz |
| **GitHub Copilot code review** | natif GH | alternatif si seats Copilot |
| **Cursor Bugbot / autres** | variable | option |
| **Humain + `/code-review` agents** | dev-core | **toujours** sur changements sécu/auth |

→ **CodeRabbit (ou équivalent)** sur PRs dès que CI stable ; ne remplace pas review humaine sécu.

#### Logs / uptime / APM

| Option | Force | Faiblesse | Reco |
|---|---|---|---|
| **CF Workers observability** + logs structurés JSON | natif, cheap | moins « product » | **P0** (toujours) |
| **Better Stack** (Logtail + Uptime + incidents) | simple, bon DX indie/SaaS, prix prévisible | moins profond que Datadog | **P1 recommandé** kit A / petite équipe |
| **Datadog** | APM complet, traces, metrics | cher, overkill agency | **non default** sauf contrat client enterprise |
| **GlitchTip** (self-host) | Sentry-like OSS, déjà écosystème ops possible | ops self-host | alternatif errors si on refuse SaaS |
| **Grafana Cloud** | metrics/logs/traces | setup | option mid |

→ **Default kit :** logs structurés CF + **Better Stack** (logs + uptime) quand prod. Datadog = exception.

#### Errors vs product analytics vs telemetry (ne pas confondre)

| Besoin | Outil | Reco |
|---|---|---|
| **Error tracking** (exceptions FE/BE) | **Sentry** (ou GlitchTip) | **P1** — source maps, release, Workers SDK si dispo |
| **Product analytics** (funnels, events, feature flags product) | **PostHog** | **P2** si on instrumente produit SaaS ; self-host possible |
| **Web analytics privacy** (pages vues, pas de cookies lourds) | **Plausible** | **P1** sites publics Kit (déjà `analytics.example.com`) |
| **OpenTelemetry** | traces/metrics standard | **P2** si multi-services + export Better Stack/Grafana ; pas jour 1 |
| ShipFast DataFast | analytics marketing Marc | non — rester Plausible/PostHog |

**Règle anti-doublon :**

```text
Plausible  = trafic web anonyme (sites)
Sentry     = crashs & exceptions
PostHog    = product events / feature flags produit (si besoin)
OTel       = standard de transport (optionnel)
Better Stack = logs agrégés + uptime + alertes
```

Ne pas activer PostHog **et** Plausible **et** Sentry Session Replay sans raison — privacy + coût.

#### ShipFast extras (indices gardés)

- Favicon / OG / logo conventions  
- Error page + support CTA  
- Rate limit auth + API  
- Security headers  
- Zod validation  
- OAuth + magic links (via Better Auth)  
- Stripe / email (P2/P1)  
- **Pas** Next stack

---

### J. Hors stack default Chemin A

| Non | Pourquoi |
|---|---|
| Next / OpenNext spine | Chemin B |
| NestJS | Node, pas Workers |
| Prisma primary | D1 |
| Clerk | lock-in |
| Shared team API key | frame |
| TanStack Start as only backend | casse MCP multi-client |
| Datadog default | coût / complexité |
| Billing multi-tenant share v1 | frame non-goal |

---

### K. Forme monorepo

```text
kit/
├── packages/   core config db storage auth types ui i18n email mcp …
├── apps/
│   ├── example-api/ example-web/ mcp-example/   # kit extractible
│   └── <product>-*                             # product repos only (not in this kit)
├── tooling/
├── .github/workflows/
├── package.json          # bun workspaces
├── turbo.jsonc
├── biome.json
├── artifacts/
├── AGENTS.md
└── CLAUDE.md
```

| Zone | Upgrade |
|---|---|
| `packages/*` | kit only (optional modules) |
| `apps/example-*` | prouve kit seul |
| `apps/<product>-*` | product repos (inherit immediate parent as fetch-only `upstream`); never dual-edit kit paths |

### Phasage (boilerplate-first)

| Phase | Contenu |
|---|---|
| **B0** | Bun+Turbo monorepo · Biome · Vitest · Lefthook · AppError+requestId · `packages/core`+`config` · `apps/example-api` health |
| **B1** | `example-api` : Hono + D1 demo schema + Zod + guards skeleton · CI typecheck/test/lint |
| **B2** | `packages/db`+`storage` generic · R2 helper demo · migrations pattern |
| **B3** | `packages/auth` Better Auth SessionPort + cookies · key hash demo · **not** share domain |
| **B4** | `example-web` TanStack+shadcn Base UI · i18n FR/EN · ApiError client |
| **B5** | FastMCP `mcp-example` · email + Mailpit compose (Node `@kit/email/server` only) · rate-limit/audit stubs |
| **B6** | Extract dry-run CI · docs kit · Sentry/Better Stack hooks · Playwright smoke examples |
| **P1 later** | `apps/share-*` product slices M0–M6 **on top of** kit |

### Couches API

| Layer | Peut | Ne peut pas |
|---|---|---|
| repos | `@kit/db` | services, routes |
| services | repos, packages | D1/R2 brut hors storage/db |
| routes | services, guards | repos direct |
| web | ui, api client | secrets serveur |

Règles : guard first · Zod double frontière · pas de god file · packages ↛ apps · private_key → 404.

---

### L. Références

| Repo | Voler |
|---|---|
| `~/projects/other-boilerplate` | Bun+Turbo+Biome+Better Auth+TanStack+errors+i18n Paraglide — **pas** Nest |
| create-t3-turbo | packages boundaries |
| kriasoft/react-starter-kit | Workers+Hono+Router+auth |
| jahands/workers-monorepo | mono CF spine |
| punkpeye/fastmcp | MCP DX + edge |
| backend-api-kit | API keys + D1 + Biome |
| ShipFast docs | errors UX, headers, rate limit, assets |

---
