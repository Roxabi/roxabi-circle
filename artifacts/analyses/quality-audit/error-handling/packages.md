# Error Handling — packages (kernel + SaaS + incubating)

| | |
|---|---|
| **Domain** | Error Handling |
| **Partition** | `packages/core`, `api-client`, `auth`, `email`, `storage`, `mcp`, `flows`, `tasks`, `comments` |
| **Date** | 2026-08-12 |
| **Method** | ripgrep catch/throw/AppError/Result + full read of error surfaces (`errors.ts`, package domain errors, empty catches) |
| **Out of scope** | apps compose mapping (except dogfood evidence for map risk) · `packages/ui` · `db` · `i18n` |

## Summary

**Public HTTP safety is strong at the kernel:** `@kit/core` `AppError` + `toApiErrorBody` scrub 5xx messages/details and map unknown throws to a generic `INTERNAL_ERROR` — stacks and raw `Error.message` never reach the JSON client when apps use that helper (dogfood `example-api` does). Auth dual-path uses `AppError.unauthorized`; MCP catalogue wraps tool failures in `PublicToolError` with catalogue-only messages (tested against `sk_` leak). Flows prefer **Result** (`checkPlan`, `createRunSnapshot`, `parseCapabilityGrant`) for plan/grant validation; tasks/comments prefer **Zod `safeParse`** with almost no throws.

The main residual risk is **domain-error fragmentation without a kit adapter**: `StorageError`, `PlanYamlError`, bare `Error` (email/config, registry, api-client non-envelope), and `AppError` coexist. Unknown package throws collapse to 500 via `toApiErrorBody` (safe, wrong status) and **ops logs still get full `err.message` + stack**. Empty catches are present but mostly **intentional fail-closed** (session null, password false, whoami unreachable, SMTP cleanup). No P0 client leak found under the kit → `toApiErrorBody` path.

### Posture by package

| Package | Pattern | Client-leak risk | Notes |
|---------|---------|------------------|--------|
| `@kit/core` | AppError + scrub | **Low** | SSoT; 5xx scrub tested |
| `@kit/api-client` | ApiError \| bare Error | **Low** (FE) | Non-envelope → `HTTP ${status}` |
| `@kit/auth` | AppError on dual-auth; bare Error on helpers | **Low** | Empty catch → null session / false password |
| `@kit/email` | throw bare Error (Workers); Result (SMTP Node) | **Low client / medium logs** | Resend body slice in message |
| `@kit/storage` | `StorageError` codes | **Low client / wrong status** | No AppError map in dogfood |
| `@kit/mcp` | `PublicToolError` + whoami status Result | **Low** | Strong wrap tests |
| `@kit/flows` | Result check/snapshot; throw YAML/registry | **Low until HTTP surface** | PlanYaml embeds raw YAML msg |
| `@kit/tasks` | Zod safeParse; 1 bare throw | **Low** | Pure kernel |
| `@kit/comments` | Zod safeParse only | **None** | No throw/catch in prod src |

---

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| F1 | **P1** | `packages/storage`, `packages/flows`, `packages/email` (+ app `onError`) | **No kit adapter from domain errors → AppError / ErrorCode** — product must map or get wrong HTTP semantics | `StorageError` only thrown in `storage/src/index.ts` (PATH_TRAVERSAL / OUTSIDE_PREFIX / IO); **zero** `instanceof StorageError` outside package tests. Uncaught → Hono `toApiErrorBody` → **500 INTERNAL** (message scrubbed). `PlanYamlError` / registry `Error` same fate when HTTPized. Email config/`EMAIL_RECIPIENT_*` also bare `Error`. Dogfood invitations wrap send failures as `AppError.internal` (good); storage path does not map PATH_TRAVERSAL → 400. | Document map recipe: PATH_TRAVERSAL/OUTSIDE_PREFIX → `AppError.validation`; PlanYaml `YAML_*`/`PLAN_SCHEMA_*` → validation; email policy → 400/403 codes. Optional `@kit/core` helpers `fromStorageError` / `isKitDomainError` when second call site appears. Prefer Result at HTTP boundary for flows check issues. |
| F2 | **P1** | `packages/mcp/src/catalogue.ts` | **Input Zod not enforced in kit wrap** → schema failures may surface as `INTERNAL_ERROR` instead of `INVALID_ARGUMENTS` | Wrapper: budget → `execute` → optional **output** safeParse. No `tool.input.safeParse`. Throws from execute (incl. bad-shape surprises) → `toPublicToolError` → catalogue `INTERNAL_ERROR` (no leak — OK). Wrong code for agent recovery. (Same gap tracked type-safety F1.) | `safeParse` input before execute; fail → `PublicToolError('INVALID_ARGUMENTS')`. Keep budget first. |
| F3 | **P2** | `packages/email/src/index.ts` L351–353 | **Resend failure embeds provider body (≤200 chars) in thrown `Error.message`** | `throw new Error(\`Resend send failed: ${res.status} ${detail.slice(0, 200)}\`)`. Client: scrubbed via `toApiErrorBody`. Ops: `error-handler` logs `err.message` + stack on 5xx — provider text (possibly tokens/PII snippets) lands in CF logs. | Throw stable `AppError.internal` or typed email error with **code only**; log redacted status at app/port; never put `res.text()` into thrown public message. |
| F4 | **P2** | `packages/email` Workers vs `server.ts` | **Throw vs Result mix on `EmailPort.send`** | Workers factory: config asserts **throw**; Resend/cf failures **throw**. Type: `Promise<{ ok: boolean; transport: string }>` — success returns `{ ok: true }` only. SMTP Node: `SmtpSendResult` **ok:false + error**. Callers that only check `!sent.ok` miss throw path (invitations try/catch covers; `sendDemoEmail` does not). | Document: Workers EmailPort is throw-on-fail; SMTP is Result. Or unify Workers send to Result `{ ok: false, errorCode }` without raw provider text. |
| F5 | **P2** | `packages/api-client/src/index.ts` | **Inconsistent client error types + weak envelope check** | Kit body with `error.code` → `ApiError`. Non-JSON / missing code → bare `Error(\`HTTP ${status}\`)` (L59–73). Success body untyped cast. `apiErrorToMessage` returns raw `Error.message` for non-ApiError (L109–110). | Always throw `ApiError` with synthetic code (`HTTP_ERROR` / `NETWORK`) + status; optional Zod for envelope; never surface raw parse text beyond status. |
| F6 | **P2** | `packages/flows/src/yaml.ts` L55–74 | **PlanYamlError rethrows raw YAML/Zod messages (+ cause as details)** | Catch parse: `err instanceof Error ? err.message : …` and `details: err`. Safe today (no HTTP). When create-run API ships, careless `AppError.validation(e.message, e.details)` could ship library wording / large detail trees. | Prefer stable codes only on public wire; keep raw message server-log; map `PLAN_SCHEMA_ERROR` to field issues via `safeParsePlanDocument` Result, not throw. |
| F7 | **P2** | `packages/auth/src/better-auth-port.ts` L74–77 | **Empty catch on `resolveSession` → null** (misconfig looks like logged-out) | `catch { return null }`. Fail-closed for authz (good). Infra factory should fail earlier; silent swallow hides BA binding bugs as 401. (Also security S10.) | Keep null for authz; optional debug log at app middleware (non-prod) when catch fires — never client stack. |
| F8 | **P2** | `packages/core` vs package table / AGENTS | **No shared `Result` type in `@kit/core`** despite Result-style APIs proliferating | Core exports AppError only (`index.ts`). Flows/MCP/email invent local `{ ok: true\|false }`. AGENTS stack row still says “AppError, Result, …”. | Either export minimal `Result<T,E>` + helpers in core **when second shared consumer needs it**, or drop Result claim from kit docs. Do not force rewrite of pure flows checks. |
| F9 | **P3** | `packages/email/src/server.ts` L145–171 | **Bare empty catch on SMTP cleanup / QUIT** | QUIT ignore; finally ignore releaseLock/close errors. Intentional best-effort cleanup; primary path maps errors to `ok: false`. | Leave; optional debug log if Mailpit flakiness hard to diagnose. Not swallowed success path. |
| F10 | **P3** | `packages/auth/src/keys.ts` L121–123 · `require-auth.ts` L50–51 · `mcp` whoami/url | **Bare catch fail-closed (password / bad key format / URL)** | `verifyPassword` catch → false; bad prefix → `AppError.unauthorized`; bad URL → null host. Correct security posture. | Keep; no empty-swallow of effectful work. |
| F11 | **P3** | `packages/tasks/src/scope.ts` L43–45 · `flows/src/registry.ts` | **Bare `Error` / `TypeError` for programmer invariants** | `normalizeScope` half-null pair; registry empty version / duplicate tool / frozen map. Not HTTP-shaped. Schema path already encodes scope pair in Zod superRefine. | Prefer Zod-only at wire; keep throws for registry factory (startup). Align `normalizeScope` with safeParse Result if used at API boundary. |
| F12 | **P3** | `packages/core/src/logger.ts` | **Structured logger has no field redaction** | `emit` JSON-stringifies caller fields as-is. Error handler logs stack (app). Risk is caller discipline, not logger. | Document “never log secrets/bodies”; optional future redact for known keys (`authorization`, `cookie`). |
| F13 | **P3** | `packages/core/src/errors.ts` · `packages/types` | **Small fixed ErrorCode set; domain codes stay local** | Kit codes: UNAUTHORIZED…INTEGRATION_NOT_CONFIGURED. Storage/YAML/PublicTool codes are parallel enums — intentional package purity, but consumers juggle multiple code alphabets. | Keep domain codes package-local; document mapping table in product contract. Avoid stuffing product codes into `@kit/types`. |
| F14 | **P3** | `packages/api-client` · `ApiError.code: string` | **ApiError.code not typed as `ErrorCodeName`** | Constructor accepts any body code string. Allows future product codes but weakens FE catalogs. | `code: ErrorCodeName \| (string & {})` or keep string + document extension. |

### Non-findings (healthy)

| Area | Evidence |
|------|----------|
| **5xx message scrub** | `toApiErrorBody`: AppError status≥500 → message `Internal error`, no details; unknown → same. Tests in `errors.test.ts`. |
| **4xx details preserved** | validation fieldErrors, rateLimited retry, integrationNotConfigured details stay public — by design. |
| **MCP tool wrap no secret leak** | `catalogue.test.ts` throws with `sk_…` → PublicToolError INTERNAL without secret. |
| **Whoami fail-closed** | Network/config → status enum, **no throw**; no key material in result. |
| **Auth dual-path** | Invalid Bearer → AppError.unauthorized (not cookie fallback). |
| **parseOrThrow** | Zod → AppError.validation + fieldErrors. |
| **Flows check Result** | `checkPlan` / `createRunSnapshot` / grant parse never throw for validation failure. |
| **Comments** | No catch/throw in prod src — pure safeParse + visibility helpers. |
| **Empty catch abuse** | No “catch empty and continue happy path” on effectful IO in scoped packages except intentional fail-closed / cleanup. |
| **SQL leak in packages** | No SQL string construction in error messages under scope; D1 errors would be bare if thrown from apps/repos (app domain). |

### Empty / bare catch inventory (scoped packages, prod)

| Location | Behavior | Class |
|----------|----------|--------|
| `auth/better-auth-port.ts` resolveSession | return null | fail-closed session |
| `auth/keys.ts` verifyPassword | return false | fail-closed verify |
| `auth/require-auth.ts` apiKeyPrefix | throw AppError.unauthorized | map + rethrow |
| `api-client` JSON.parse | rethrow HTTP/Invalid JSON | map + rethrow |
| `mcp/index.ts` URL parse | return null | fail-closed |
| `mcp/index.ts` whoami fetch | status unreachable | fail-closed Result |
| `mcp/catalogue.ts` execute | toPublicToolError rethrow | wrap |
| `email/server.ts` QUIT + finally | ignore | cleanup |
| `email` resend `.catch(() => '')` | empty body detail | degrade message only |
| `flows/yaml.ts` | rethrow PlanYamlError | wrap |

---

## Metrics

| Metric | Value |
|--------|------:|
| Packages in scope | **9** |
| Prod source modules reviewed (approx.) | **~55** under listed packages `src/` (excl. tests) |
| Domain error classes | AppError · ApiError · StorageError · PlanYamlError · PublicToolError · bare Error |
| Empty/bare catch sites (prod, scoped) | **~12** (all classified above) |
| Packages with zero throw/catch (prod) | **comments** |
| AppError usage in packages | **core** + **auth** only among scope |
| Result-style ports | flows check/snapshot/grant · mcp budget/whoami · email SMTP |
| Issues | **P0=0 · P1=2 · P2=6 · P3=6** |
| Notable hotspots | domain→AppError map gap · mcp input errors · email Resend message · api-client Error vs ApiError |

### Hunt checklist

| Hunt item | Result |
|-----------|--------|
| AppError discipline | Strong in core/auth; other packages use domain errors / bare Error (by purity) |
| Empty catch | Present; intentional fail-closed or cleanup — not silent success after failed IO |
| Swallowed errors | Session/password/whoami intentionally; SMTP cleanup only |
| Stack / SQL leak to client | Blocked by `toApiErrorBody` if used; logs may hold messages (Resend) |
| Bare catch | Yes — see inventory |
| Inconsistent codes | Multiple alphabets (kit ErrorCode vs Storage/YAML/PublicTool) |
| Result vs throw mix | Intentional in flows/email/mcp; email Workers vs SMTP inconsistent for callers |

---

## Recommendations

1. **P1 — Domain error map (F1):** Before any product HTTP surface for storage/flows/email, ship a short **mapping table** (path → status + ErrorCode) in package README or `docs/product-consumer-contract.md`. Prefer map at service layer, not only global onError.
2. **P1 — MCP input safeParse (F2):** Fail closed with `INVALID_ARGUMENTS` before `execute` so agent-facing codes stay accurate without weakening leak protection.
3. **P2 — Email provider noise (F3/F4):** Stable internal error on Resend/CF send failure; log status only; document throw-vs-Result for EmailPort.
4. **P2 — api-client (F5):** Normalize all failures to `ApiError` (synthetic code) so FE `instanceof` / catalogs work for 502 HTML and network errors.
5. **P2 — Flows public wire (F6):** When create-run lands, expose `CheckIssue[]` / YAML codes — not raw `yaml` package messages.
6. **P3 hygiene:** Optional core `Result` only if shared; logger redaction doc; leave fail-closed empty catches as-is.

### Suggested severity rollup for synthesis

| Severity | Count | Theme |
|----------|------:|-------|
| P0 | 0 | — |
| P1 | 2 | Map gap · MCP validation code path |
| P2 | 6 | Email/API-client/YAML/session-null/Result doc |
| P3 | 6 | Bare throws · logger · code alphabets |
