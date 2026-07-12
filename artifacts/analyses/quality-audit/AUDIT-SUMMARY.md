# Code Quality Audit Summary

**Repo:** `go-silex/silex-share`  
**Date:** 2026-07-12  
**Scope:** Kit extractible Chemin A (packages + `apps/example-*` + `apps/mcp-example`) — produit `share-*` **absent**  
**Playbook:** multi-agent-audit-playbook v1.1  
**Duration note:** waves 1–7 · ~34 agents · structural + semantic axial · cocoindex fallback (rg multi-file, `ccc` unavailable in agents)

---

## Executive Summary

### Santé globale

Le monorepo est un **kit early-stage sain** : axe primaire **packages compose apps** respecté, DAG sans cycles, **0 reverse import** packages→apps, banlist / extract structurel verts, floors de couverture **tous passés**, spine dual-auth (HMAC session + `sk_`) + IDOR notes **corrects pour une démo**.

Ce n’est **pas** encore un boilerplate « prod-ready » : surface AGENTS en avance sur le code (Better Auth, Zod 4, HSTS, Paraglide, transport email, FastMCP wrapper), dettes de **template** (seed démo non gaté, auth impérative, CSRF Origin manquant), et trous de **defense-in-depth** dans le kit crypto/erreurs/storage.

**Verdict :** extractible et dogfoodable en local · **ne pas** exposer `example-api` public sans les P0-process (seed) + P1 sécu listés · produit `share-*` **après** promotion des surfaces package-worthy.

### Posture sécurité

| Zone | État |
|------|------|
| Secrets hardcodés dans packages | **0** |
| Stacks / SQL vers le client (unknown errors) | **OK** (scrub) |
| IDOR notes + CORS allowlist + credentials | **OK** (tests) |
| SESSION_SECRET fail-closed hors dev/test | **OK** |
| Crypto passwords | PBKDF2 (pas SHA-256 seul) — **OK direction** |
| Gaps kit | session `exp` non typé · PBKDF2 iters non bornés · `AppError` 5xx public · `joinObjectKey` prefix |
| Gaps demo app | seed users à chaque login · pas de rate-limit · keys sans revoke · Origin mutations |

**P0 remote exploit en isolation : aucun.** Risque principal = **footgun de template** + **info disclosure / DoS auth** si copié tel quel en public.

### Couverture tests

| | |
|--|--|
| Floors | **11/11 packages verts** (T0 auth ~86%, example-api ~84% ; T2 web **10.67%** / ui **21.99%** — headroom T2 critique) |
| CP-\* | inventaire docs only — **0** tag `CP-*` dans les tests |
| Trous | cookie helpers package, email service ~1.7%, `lib/auth.ts` 0%, matrice unauth incomplète, `AppError.internal` non redacted en test |

### Dette clé

1. **AGENTS ↔ réalité** (HMAC/ADR-0002 vs Better Auth ; map packages surclaim)  
2. **Auth template** (middleware fail-open · seed · keys lifecycle · SessionPort)  
3. **Error contract** (5xx message public · FE sans `apiErrorToMessage` / global 401)  
4. **Infra kit** (email transport in-app · D1 test double ×3 · MCP exact tools)  
5. **Gates honesty** (double suite pre-push · extract structurel ≠ suite verte post-drop)

### Scale

| | |
|--|--|
| Source TS/TSX (ordre de grandeur) | ~111 fichiers · ~17 suites test |
| Agents domaine | ~34 (architecture 7 · security 5 · smells 7 · types 2 · async 1 · errors 2 · tests 3 · techdebt 2 · axial 3 · cocoindex 1 · synthesis 1) |
| Domaines | 9 + axial + cross-domain |
| P0 confirmés (dédup) | **0** |

---

## Critical Issues (P0)

**Aucun P0 confirmé.**

Aucun finding classé P0 (vuln remote exploit, data loss, ou axial drift bloquant extract) n’a été retenu après déduplication inter-domaines. Les risques « deploy public de la démo » (seed credentials, fail-open auth) restent **P1 process/template**, pas un break crypto ou un reverse package→app.

---

## High Priority (P1)

*Dédupliqués — tags multi-domaines · chemins concrets.*

### A. Sécurité kit (consommateurs de packages)

| ID synth | Domaines | Fichiers | Problème |
|----------|----------|----------|----------|
| **S1** | Sec P2 · TS · TD-A | `packages/auth/src/session.ts` | **`verifySession` :** payload non validé — `exp` manquant / non-number → session immortelle après HMAC valide. Fail-closed try/catch incomplet. |
| **S2** | Sec P2 · TQ | `packages/auth/src/keys.ts` | **`verifyPassword` :** `iterations` stockées sans plafond → CPU DoS si hash row writable ; floor trop bas (accepte `1`). |
| **S3** | Sec P1 · Err BE · CC-009 | `packages/core/src/errors.ts` · `apps/example-api/src/lib/session-env.ts` | **`toApiErrorBody` :** tout `AppError.message` (y compris 5xx / `AppError.internal`) est public — ex. détail `SESSION_SECRET`. |
| **S4** | Sec P1 · TS | `packages/core` + `packages/types` | **`details?: unknown`** sérialisé tel quel sur le wire — pas d’allowlist / taille. |
| **S5** | Sec P3 · Err · Smells · CC-006 | `packages/storage/src/index.ts` | **`joinObjectKey` :** `prefix` non segment-validé (`demo/../x`) ; put/get/delete acceptent toute clé (bypass join). Call sites demo OK. |

### B. Sécurité / template demo (`example-api` / web) — *demo-only risk si exposé*

| ID | Domaines | Fichiers | Problème |
|----|----------|----------|----------|
| **D1** | Sec P5 · TD-B | `services/auth.ts` · `seed/*` | **`ensureDemoUsers` à chaque login**, indépendant de `ENVIRONMENT` — passwords publics en staging/prod. |
| **D2** | Sec/Arch/Smells P5 · CC-003 | `middleware/require-auth.ts` · routes | **Auth impérative** `await requireAuth(c)` ×6 — oubli = endpoint ouvert. |
| **D3** | Sec P5 | login / keys / email | **Aucun rate-limit** auth / mint / email. |
| **D4** | Sec P5 | `routes/me.ts` · `repos/keys.ts` | **Keys :** mint only, pas d’expiry/revoke/list malgré `revoked_at`. |
| **D5** | Sec P6 · TD-B | `example-web/routes/login.tsx` · `keys.tsx` | **Creds démo préremplis** ; **`sk_` en state/DOM** sans clear timer. |
| **D6** | Sec P5/P6 · AGENTS §D | mutations cookie | **Pas de vérif Origin** sur mutations (rely SameSite=Lax seulement). |

### C. Architecture / axial / DRY (avant `share-*`)

| ID | Domaines | Fichiers | Problème |
|----|----------|----------|----------|
| **A1** | Smells P3 · Arch · CC-001 | db test · `memory-env` · `seed-local` | **D1 better-sqlite3 shim ×3** — three-strikes déjà atteint → `@gosilex/db/test`. |
| **A2** | Arch/TD email · Err BE · CC-007 | `packages/email` vs `services/email.ts` | **Transport SMTP/log dans l’app** ; false success `ok: true` après catch SMTP. |
| **A3** | Arch/TD mcp · Smells | `packages/mcp` · `mcp-example` | **Pas de wrapper FastMCP** ; `assertExactKitTools` hard-lock `ping`/`whoami` — hostile multi-app. |
| **A4** | Arch P6 · Err FE · CC-008 | `example-web/src/lib/api.ts` | **`ApiError` / `apiFetch` app-local** ; pas de kit client ; pas `apiErrorToMessage`. |
| **A5** | Err FE · Arch P6 | `notes.tsx` · `main.tsx` · `auth.ts` | **Query fail = empty UI** ; pas de global Query onError ; `isUnauthorized` mort ; AuthGate sur tout `me.isError`. |
| **A6** | Arch P5 · Smells | `services/auth.ts` | **Login SQL hors users repo** (secondary axis partial). |
| **A7** | TD-A · Arch auth | `packages/auth` · ADR-0002 | **HMAC interim sans `SessionPort`** ; guards non packagés ; AGENTS dit encore Better Auth. |

### D. Async / correctness template

| ID | Domaines | Fichiers | Problème |
|----|----------|----------|----------|
| **Y1** | Async · TD-B | `services/notes.ts` | **Create D1 puis R2 non atomique** ; **delete R2 puis D1** + swallow — partial failure multi-store. |
| **Y2** | Async · Err | `services/email.ts` | **SMTP writer/socket sans `finally`** → leak sous Workers `connect()`. |
| **Y3** | Async · Arch web | `app-shell.tsx` AuthGate/AdminGate | **Navigate pendant render** (`queueMicrotask`) — anti-pattern concurrent React. |

### E. Gates / vérité process

| ID | Domaines | Fichiers | Problème |
|----|----------|----------|----------|
| **G1** | Arch P7 · TD-B · COV | `package.json` · `test-coverage.sh` | **`validate:full` rejoue toute la suite** (turbo test + coverage) — risque skip hooks. |
| **G2** | Arch P7 · TD-B · COV | `extract-dry-run.sh` · AGENTS | **Extract structurel** ≠ « drop share-* → suite verte ». |
| **G3** | TD-B · COV · TQ | docs + tests | **CP-\* non liés aux tests** ; floors T2 quasi collés au plancher. |

---

## Medium Priority (P2)

*Thèmes (pas chaque finding).*

| Thème | Exemples | Domaines |
|-------|----------|----------|
| **Headers / CSRF defense-in-depth** | pas HSTS/CSP API ; pas Origin mutations ; SPA sans CSP | Sec P5/P6 · Arch |
| **Cookie / secret policy package** | `Secure` opt-in ; secret HMAC min length non enforced in package | Sec P2 · Arch P2 |
| **Error surface incomplete** | pas `cause` / `rateLimited()` ; Zod→validation dupliqué ; Hono 404 hors envelope | Err BE · Arch P1 |
| **FE error UX** | pas ErrorBoundary ; fieldErrors ignorés ; toast `String(e)` ×4 | Err FE · Smells P6 |
| **Wiring debt API** | `createDb` ×≥6 handlers ; env Zod inventory only | Arch P5 · Smells |
| **MCP whoami / env** | presence-only ; `keyPrefix` 8 chars ; stdio hérite env | Sec P3/P6 · TD |
| **UI kit** | sidebar god (~686 LOC) + cookie write-only ; a11y Biome off ; toast dual import sonner | Arch/Smells P4 |
| **i18n** | EN hardcodé keys/dashboard/DS ; hand-rolled vs Paraglide claim | Arch/Smells P6 · TD-B |
| **Type holes** | `ErrorCode` as free `string` ; `createDb` `as never` ; `apiFetch as T` ; Zod absent packages | Type safety |
| **AbortSignal / Query** | signal non filé ; login double-submit | Async |
| **CI / supply chain** | CI ≠ `validate:full` ; pins tags vs SHA ; lefthook `\|\| true` | Arch P7 · TD-B |
| **Coverage thinness** | cookie package untested ; email 1.7% ; core funcs ~55% | Test quality |
| **PBKDF2 100k &lt; OWASP 600k** | documenter demo vs prod | Sec P2 |
| **RBAC cosmétique** | role seed map mémoire ; pas de gate serveur | Sec P5 · TD-B |

---

## Low Priority (P3)

| Thème | Notes |
|-------|--------|
| Magic numbers crypto/TTL | nommer constantes |
| Dead deps / shims | `@gosilex/core` unused in auth ; `@gosilex/types` unused in example-api ; `home.tsx` dead |
| `'use client'` noise UI | Next paste |
| Request-id client unbounded | format allowlist |
| Login timing oracle | acceptable demo |
| Banlist false-negative patterns | `private_key` alone etc. |
| Orphan root `tsconfig` / turbo lint dead | hygiene |
| CODEOWNERS absent | Free private process |
| Zero TODO tags | backlog invisible (ADR/issues) — hygiène positive mais risque |

---

## Axial Drift Summary

| Axis | Violations | N×M Traps | Cocoindex Confirmations |
|------|------------|-----------|-------------------------|
| **Primary: packages compose apps** | **0** reverse imports ; **0** product share impl under packages | **Confirmed (1):** D1 sqlite adapter ×3 (CC-001) | OK: crypto only in `@gosilex/auth` ; AppError SSoT core ; packages↛apps ; banlist clean |
| **Secondary: routes→services→repos** | **1** : login SQL in `services/auth` (pas users repo) | routes↛repos **OK** | CC-P03 probable |
| **Pre-product traps (probable)** | — | middleware Hono app-local · session-env · FE ApiError · email transport · KitRole mirror | CC-P01/P02 · CC-007/008 |
| **import-linter** | **Absent** (process + scripts only) | — | Structural report substitutes |
| **Extract / banlist** | Structure OK · claim overstated | — | import presence + banlist reimplemented in structural agent |
| **Three-strikes product apps** | **0** (share-* absent) | Forward-looking only for most platform helpers | — |

**Overall axial health:** **green** for extract today · promote package surfaces **before** scaffolding `share-*`.

---

## Metrics Dashboard

*Sommes brutes des rapports domaine — **overcount** important (même root cause dans 2–5 domaines). Utiliser les tables P1 dédupliées pour prioriser.*

| Domain | Issues | P0 | P1 | P2 | P3 |
|--------|-------:|---:|---:|---:|---:|
| Security (5 partitions) | 65 | 0 | 12 | 29 | 24 |
| Architecture (7) | 89 | 0 | 12 | 43 | 34 |
| Code smells (7) | 97 | 0 | 13 | 33 | 51 |
| Type safety (2) | 35 | 0 | 6 | 13 | 16 |
| Async (1) | 19 | 0 | 4 | 8 | 7 |
| Error handling (2) | 31 | 0 | 6 | 12 | 13 |
| Test quality (3) | 41 | 0 | 10 | 18 | 13 |
| Tech debt (2) | 52 | 0 | 12 | 22 | 18 |
| **Raw sum** | **~429** | **0** | **~75** | **~178** | **~176** |
| **Unique synth (approx.)** | — | **0** | **~25** | **~15 themes** | **~10 themes** |

**Axial (hors table brute) :** 0 three-strikes product · 1 confirmed DRY three-strikes (D1 adapter) · 4 probable N×M traps · 6 composition praises.

---

## Recommended Actions

Priorisées · effort **S** (&lt;0.5 j) / **M** (0.5–2 j) / **L** (multi-jours).

| # | Action | Effort | IDs |
|---|--------|--------|-----|
| 1 | Harden `verifySession` (shape + try/catch always null) + tests négatifs | **S** | S1 |
| 2 | Bound PBKDF2 iterations on verify (+ floor) | **S** | S2 |
| 3 | Scrub `AppError` 5xx public message ; constrain `details` | **S–M** | S3, S4 |
| 4 | Gate `ensureDemoUsers` to `development`\|`test` + test prod | **S** | D1 |
| 5 | Mount `requireAuth` as Hono middleware (fail-closed) | **S–M** | D2, A6 |
| 6 | Validate `joinObjectKey` prefix segments + tests | **S** | S5 |
| 7 | Align AGENTS ↔ ADR-0002 (HMAC now / Better Auth later) + checklist S0 ticks | **S** | A7, G docs |
| 8 | Single-pass `validate:full` (coverage replaces bare test) | **S–M** | G1 |
| 9 | Honest extract docs **or** real extract job | **S** / **L** | G2 |
| 10 | Promote `@gosilex/db/test` D1 shim | **M** | A1 |
| 11 | Auth middleware + Origin on cookie mutations ; rate-limit login/mint | **M** | D3, D6 |
| 12 | Key revoke/list + session-only mint policy | **M** | D4 |
| 13 | FE: global Query onError + 401 + `isError` empty fix + `apiErrorToMessage` | **M** | A4, A5 |
| 14 | Email: transport package + no false `ok` + SMTP `finally` | **M–L** | A2, Y2 |
| 15 | Notes multi-store ordering + compensating actions | **M** | Y1 |
| 16 | AuthGate navigate in `useEffect` / router `beforeLoad` | **S** | Y3 |
| 17 | MCP: soft allowlist + drop keyPrefix ; later FastMCP factory | **M** | A3 |
| 18 | `SessionPort` before Better Auth product work | **M–L** | A7 |
| 19 | Tag tests `CP-*` ; cookie unit tests ; unauth matrix | **M** | G3, TQ |
| 20 | HSTS/CSP kit template ; SPA CSP when dual-host | **M** | P2 headers |

**Bloquants « public deploy example-api » :** #4, #5, #1–3, #11.  
**Bloquants « scaffold share-* » :** #10, #13–14, #17–18, #7–9.

---

## Technical Debt Score

### **74 / 100**

| Facteur | Impact approx. |
|---------|----------------|
| Base | 100 |
| P0 confirmés (0 × 12) | 0 |
| P1 sécu uniques (clusters S1–S5 ≈ 5 × 4) | **−20** |
| P1 demo-template (D1–D6 clusterés ≈ 4 × 2.5) | **−10** |
| P1 autres (A1–A7, Y1–Y3, G1–G3 ≈ 8 × 2.5) | **−20** |
| P2 themes (~12 × 0.5, cap) | **−6** |
| **Sous-total** | **44** |
| Bonus axe extract + DAG clean | **+10** |
| Bonus gates (lefthook, banlist, floors all green, secret-scan) | **+12** |
| Bonus IDOR/CORS/fail-closed secret/crypto direction | **+8** |
| **Score final** | **74** |

**Formule (playbook) :**  
`score ≈ 100 − 12·P0 − 4·P1_sec − 2.5·P1_other − 0.5·P2_themes + bonuses`  
Bonuses pour axe fort, gates, floors verts, pas de secrets kit.

**Lecture :** kit early **dans la fourchette saine 65–80**. Pas pristine (auth interim, doc lag, template footguns) mais **structuré et ratcheté**. Descendreait sous 60 sans bonus extract/gates ; monterait vers 85 après S1–S5 + D1–D2 + G1–G2.

---

## Top 10 Quick Wins

*High impact · low effort (S).*

1. **`verifySession` shape + fail-closed catch** + 5 tests négatifs (`packages/auth`)  
2. **Clamp PBKDF2 iterations** on verify  
3. **`toApiErrorBody` :** force `"Internal error"` si `status >= 500`  
4. **`ensureDemoUsers` env-gated** + test production  
5. **`joinObjectKey` validate prefix** segments  
6. **AGENTS.md** : HMAC/ADR-0002 truth ; cocher AppError/Vitest déjà shippés  
7. **`requireAuth` via `route.use`** sur notes/me/keys/demo  
8. **Empty notes UI on `isError`** + wire `isUnauthorized`  
9. **SMTP `try/finally`** close writer/socket  
10. **AuthGate redirect in `useEffect`** (stop render-time navigate)

---

## Domain Report Index

### Strategy / meta

| File |
|------|
| [`artifacts/analyses/quality-audit/STRATEGY.md`](./STRATEGY.md) |
| [`artifacts/analyses/quality-audit/AGENT_PROMPTS.md`](./AGENT_PROMPTS.md) |
| [`artifacts/analyses/quality-audit/manifest.json`](./manifest.json) |
| [`artifacts/analyses/quality-audit/cocoindex-cross-domain.md`](./cocoindex-cross-domain.md) |

### Axial drift

| File |
|------|
| [`axial-drift/importlinter-report.md`](./axial-drift/importlinter-report.md) |
| [`axial-drift/axial-adr-review.md`](./axial-drift/axial-adr-review.md) |
| [`axial-drift/cocoindex-confirmations.md`](./axial-drift/cocoindex-confirmations.md) |

### Architecture

| File |
|------|
| [`architecture/P01-core-types-config.md`](./architecture/P01-core-types-config.md) |
| [`architecture/P02-auth.md`](./architecture/P02-auth.md) |
| [`architecture/P03-db-storage-email-mcp.md`](./architecture/P03-db-storage-email-mcp.md) |
| [`architecture/P04-ui.md`](./architecture/P04-ui.md) |
| [`architecture/P05-example-api.md`](./architecture/P05-example-api.md) |
| [`architecture/P06-web-mcp.md`](./architecture/P06-web-mcp.md) |
| [`architecture/P07-tooling-ci.md`](./architecture/P07-tooling-ci.md) |

### Security

| File |
|------|
| [`security/P01-core-types.md`](./security/P01-core-types.md) |
| [`security/P02-auth.md`](./security/P02-auth.md) |
| [`security/P03-infra.md`](./security/P03-infra.md) |
| [`security/P05-example-api.md`](./security/P05-example-api.md) |
| [`security/P06-web-mcp.md`](./security/P06-web-mcp.md) |

### Code smells

| File |
|------|
| [`code-smells/P01-core-types-config.md`](./code-smells/P01-core-types-config.md) |
| [`code-smells/P02-auth.md`](./code-smells/P02-auth.md) |
| [`code-smells/P03-infra.md`](./code-smells/P03-infra.md) |
| [`code-smells/P04-ui.md`](./code-smells/P04-ui.md) |
| [`code-smells/P05-example-api.md`](./code-smells/P05-example-api.md) |
| [`code-smells/P06-web-mcp.md`](./code-smells/P06-web-mcp.md) |
| [`code-smells/T01-tests.md`](./code-smells/T01-tests.md) |

### Type safety · Async · Errors

| File |
|------|
| [`type-safety/P01-P03-packages.md`](./type-safety/P01-P03-packages.md) |
| [`type-safety/P04-P06-ui-apps.md`](./type-safety/P04-P06-ui-apps.md) |
| [`async-patterns/full-repo.md`](./async-patterns/full-repo.md) |
| [`error-handling/BE.md`](./error-handling/BE.md) |
| [`error-handling/FE.md`](./error-handling/FE.md) |

### Test quality · Tech debt

| File |
|------|
| [`test-quality/T01-packages.md`](./test-quality/T01-packages.md) |
| [`test-quality/T02-apps.md`](./test-quality/T02-apps.md) |
| [`test-quality/T03-coverage.md`](./test-quality/T03-coverage.md) |
| [`tech-debt/A-packages.md`](./tech-debt/A-packages.md) |
| [`tech-debt/B-apps-tooling.md`](./tech-debt/B-apps-tooling.md) |

---

## Method notes

| Item | Detail |
|------|--------|
| **Waves** | 7 planned · synthesis = wave 7 final |
| **Agent scale** | ~34 domain agents + synthesis |
| **Cocoindex** | Index on disk (`.cocoindex_code/`) ; **`ccc` / MCP search unavailable** in subagents → multi-file **rg + full source reads** with similarity heuristic (see `axial-drift/cocoindex-confirmations.md`, `cocoindex-cross-domain.md`) |
| **import-linter** | **Not installed** ; structural axial report substitutes (workspace graph + import scan + banlist patterns) |
| **Product scope** | `apps/share-*` **not present** — product findings deferred ; kit extract focus |
| **Dedup** | Same root cause → single synth ID with multi-domain tags ; demo-only vs package-kit distinguished |
| **Scoring** | No P0 · aggressive unique-cluster P1 · bonuses extract/gates/floors → **74/100** |

---

## Bottom line

> **Kit Chemin A extractible, axialement propre, avec gates et floors verts.**  
> Priorité immédiate : **hardening auth/errors/storage package** + **template deploy footguns** (seed, middleware auth).  
> Priorité pre-`share-*` : **D1 test package, email transport, FE error client, MCP contract, SessionPort, vérité AGENTS/extract.**  
> **Score dette technique : 74/100** — healthy early kit, backlog actionnable, zero P0.
