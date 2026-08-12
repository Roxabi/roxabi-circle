# Code Smells — SaaS packages

**Repo:** `roxabi-boilerplate-cf`  
**Date:** 2026-08-12  
**Scope:** `packages/core`, `auth`, `db`, `storage`, `email`, `types`, `api-client`, `i18n`, `ui`  
**Hunt:** god files · long functions · DRY · dead code · deep nesting · unclear naming · duplicated Zod

## Summary

SaaS capability packages are **generally lean and well-factored**: `@kit/core`, `@kit/types`, `@kit/db`, `@kit/i18n`, and most of `@kit/auth`/`@kit/storage` sit well under the ~300-line quality bar with short pure functions and clear ports. Residual smells cluster in three places: (1) **HMAC-era / dual-credential residue** on `SessionPort` and kit PBKDF2 password helpers that no longer drive login; (2) **`@kit/email` surface density** — one barrel (~433 LOC, gate exemption 450) plus five identical `build*EmailText` wrappers and five local `escapeHtml` copies; (3) **`@kit/ui` sample chrome** (`AppSidebar` + Acme data, EN-hardcoded shell blocks) exported as public kit API while `example-web` composes its own shell and only reuses `NavUser` / primitives. **No P0.** Duplicated Zod is **not** a SaaS-package problem (no Zod schemas under these packages; boundary parse is duck-typed `ParseableSchema`). God-file pressure is **tracked and exempted** for shadcn `sidebar`/`chart` and email factory.

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| F1 | P2 | `packages/email/src/index.ts` | **Near-god barrel:** multi-transport factory + staging policy + five thin builders in one module | ~433 LOC; `tools/file_exemptions.txt` caps **450** (“multi-transport factory + magic-link builder; split per transport when next consumer lands”). Mixes ADR-0004 policy (`assert*`, `createEmailPort`, allowlist wrappers) with template adapters L12–109 | Split when next consumer lands (already planned): `transports.ts` / `policy.ts` / `builders.ts` (or one file per transport). Keep `createEmailPort` as the public factory entry |
| F2 | P2 | `packages/auth/src/session-port.ts`, `better-auth-port.ts`, `require-auth.ts` | **Dead / stub API after BA-only (HMAC residue)** | `SessionPort.sign` / `verify` still required; BA adapter `sign` **throws**, `verify` **always null** (`better-auth-port.ts` L53–60). `ResolveSessionInput.secret` + `DualAuthPorts.secret` forwarded but unused by BA `resolveSession`. ADR-0002 retired HMAC | Narrow port to `resolveSession` + cookie helpers; drop or `@deprecated` `sign`/`verify`/`secret` in one release; update tests that assert throw-on-sign |
| F3 | P2 | `packages/auth/src/keys.ts` (+ seed call sites) | **Dual password KDF public surface; kit path is session-dead** | Kit exports `hashPassword` / `verifyPassword` (PBKDF2). Login is BA-only; app seeds **both** `demo_users.password_hash` via `@kit/auth` and BA `account.password` via `better-auth/crypto` (`seed-db.ts`). `verifyPassword` has **no app call site** (tests only). Risk: consumers mint kit hashes BA will not verify | Demote kit password helpers: document “demo table only”, stop dual-seed once `demo_users.password_hash` unused, or un-export from barrel and keep private for tests. Prefer BA crypto for any live credential write |
| F4 | P2 | `packages/ui/src/components/app-sidebar.tsx`, `nav-main.tsx`, `nav-projects.tsx`, `team-switcher.tsx`, `index.ts` | **Sample chrome shipped as public kit API (dead for dogfood)** | `AppSidebar` hardcodes Acme/shadcn sample `data` (~L22–150) and always binds it; exported from package barrel. `example-web` uses `app-shell` + `NavUser` only — **no** `AppSidebar` / `NavMain` / `NavProjects` / `TeamSwitcher` imports. Shell blocks also hardcode EN labels (`"Platform"`, `"Projects"`, `"Teams"`, action strings) | Prop-drive or unexport `AppSidebar` (demo/story only). Prefer data-driven composition like live `app-shell`. Optional `labels` props for FR/EN; do not force EN product chrome from kit defaults |
| F5 | P2 | `packages/email/src/index.ts` L12–109, `templates/*.ts` | **DRY: five identical builder wrappers + five local `escapeHtml`** | Each `build*EmailText` is call-template → map `{to,subject,text,html}` (near-isomorphic). Identical private `escapeHtml` in `demo.ts`, `invite.ts`, `magic-link.ts`, `reset-password.ts`, `welcome-set-password.ts` | One shared `escapeHtml` (`html.ts` or next to `redact.ts`). Collapse builders to a tiny `asEmailMessage(mail)` helper **or** export templates only and drop thin wrappers |
| F6 | P2 | `packages/auth/src/keys.ts` | **DRY: hex encode inlined 4×** | `[...new Uint8Array(...)].map((b) => b.toString(16).padStart(2, '0')).join('')` at L5, L30, L85–86, L119; only `hexToBytes` is factored | Extract `bytesToHex(bytes: Uint8Array): string` (and reuse in `hashApiKey` / `generateApiKey` / password KDF) |
| F7 | P2 | `packages/auth/src/better-auth-port.ts` | **Cookie name override via string replace** | L79–84: build with hard-coded `SESSION_COOKIE` then `.replace(\`${SESSION_COOKIE}=\`, \`${cookieName}=\`)` — brittle if format/name substring changes | Pass `cookieName` into `sessionCookieHeader` / `clearSessionCookieHeader` (single structured builder) |
| F8 | P3 | `packages/ui/src/components/ui/sidebar.tsx`, `chart.tsx` | **Tracked god files (shadcn owned sources)** | `sidebar.tsx` ~682 LOC (exemption **700**); `chart.tsx` ~341 LOC (exemption **360**). Multi-component modules (provider + menu primitives + chart tooltip plumbing) | Accept as owned shadcn sources; split only if exemption caps fire. Do not add product UI into these files |
| F9 | P3 | `packages/storage/src/index.ts` | **Dual API: free put/get/delete vs prefix-enforced client** | Free helpers L67–85 only `assertObjectKey` (no base prefix); comments prefer `StorageClient`. App dogfood uses **only** `StorageClient` (`notes.ts`, `uploads.ts`, `presign.ts`); free helpers = package tests | Mark free helpers `@deprecated` / “tests & low-level only” or stop exporting from barrel; keep `StorageClient` as default product path |
| F10 | P3 | `packages/db/src/index.ts` | **`mapInChunks` / `D1_IN_ARRAY_CHUNK` unused outside package tests** | Grep: only `index.ts` + `index.test.ts` | Keep until first multi-id `IN` repo; then prove from `example-api` repos. Avoid more unused helpers |
| F11 | P3 | `packages/api-client/src/index.ts` | **One-shot `apiFetch` allocates a new client per call** | L82–85: `createApiClient(opts).apiFetch(...)`. Comment prefers shared client; `example-web` `lib/api.ts` wraps one-shot with only `baseUrl` | Encourage module-level `createApiClient({ baseUrl })` singleton in apps; keep one-shot for scripts/tests |
| F12 | P3 | `packages/api-client/src/index.ts` | **`ApiError.code` widened to `string`** | Field L4 `readonly code: string` while wire body is `ErrorCodeName` — weakens FE exhaustiveness / catalog maps | Type as `ErrorCodeName` (or `ErrorCodeName \| (string & {})` only if product codes allowed) |
| F13 | P3 | `packages/email/src/index.ts` L429–432 | **Export asymmetry: `MagicLinkEmail` not re-exported** | Barrel re-exports `DemoEmail`, `InviteEmail`, `ResetPasswordEmail`, `WelcomeSetPasswordEmail`; magic-link only via `buildMagicLinkEmailText` | Re-export `MagicLinkEmail` for parity (or stop re-exporting all raw templates and keep builders only — pick one style) |
| F14 | P3 | `packages/email/src/templates/*` | **Unclear brand copy: “Kit kit” / EN-only subjects** | e.g. invite subject `Invitation — ${org} (Kit kit)`; bodies “Kit Kit”; no locale param despite FR-default UI narrative | Fix double “kit” naming; when multi-locale mail ships, add `locale` or move copy to app catalogs |
| F15 | P3 | `packages/db/src/index.ts` | **Escape-hatch typing on `createDb`** | L5–6: `d1: unknown` + `drizzle(d1 as never, …)` (+ eslint any on nearby comment) | Prefer Drizzle D1 client type / minimal `{ prepare }` interface so wrong bindings fail at compile time |
| F16 | P3 | `packages/core/src/parse.ts`, `index.ts` | **`ParseableSchema` exported from module but not barrel** | Type useful for consumers; barrel only exports `parseOrThrow` | `export type { ParseableSchema } from './parse'` if apps need it; otherwise leave internal |

## Metrics

- **Files reviewed (source, excl. tests/node_modules):** ~75  
  - core 4 · types 1 · api-client 1 · auth 9 · db 1 · storage 1 · email 11 · i18n 1 · ui ~45  
- **LOC hotspots (approx.):**  
  - `packages/ui/.../sidebar.tsx` ~682 (exempt 700)  
  - `packages/email/src/index.ts` ~433 (exempt 450)  
  - `packages/ui/.../chart.tsx` ~341 (exempt 360)  
  - `packages/storage/src/index.ts` ~227 · `packages/email/src/server.ts` ~178 · `packages/ui/.../app-sidebar.tsx` ~169 · `packages/ui/.../field.tsx` ~222 · `packages/auth/src/keys.ts` ~125  
- **Issues:** P0=0 · P1=0 · **P2=7** · **P3=9**  
- **Duplicated Zod in scope:** **none** (SaaS packages hold no Zod schemas; `@kit/core` `parseOrThrow` is version-agnostic. Zod density lives in incubating kernels / apps — out of this partition.)  
- **Deep nesting:** no severe handler pyramids in these packages; worst structural density is `sendSmtp` try/finally + reply loop and `createEmailPort` transport branch (acceptable).  
- **Notable dead / dual-path surfaces:** SessionPort `sign`/`verify`/`secret`; kit `verifyPassword` (no app use); free R2 helpers (tests only); `AppSidebar` graph (no app import); `mapInChunks` (tests only).

## Recommendations

1. **P2 — Prune HMAC residue (F2)** — smallest high-clarity win on `@kit/auth`; aligns public API with ADR-0002 BA-only reality.  
2. **P2 — Demote dual password KDF (F3)** — prevents product forks from hashing with kit PBKDF2 for BA logins.  
3. **P2 — Fix UI sample export (F4)** — stop shipping Acme chrome as composable kit default; match `example-web` composition pattern.  
4. **P2 — Email DRY + split plan (F1/F5)** — extract `escapeHtml` immediately; split barrel when next transport/consumer lands (exemption already anticipates).  
5. **P2 — Cookie builder + bytesToHex (F6/F7)** — small pure refactors, low risk.  
6. **P3 hygiene** — free storage helpers (F9), `ApiError.code` typing (F12), MagicLink re-export parity (F13), brand copy (F14), `createDb` types (F15).  
7. **Do not invent empty packages** for rate-limit/audit here — smells in SaaS slice are cleanup, not missing scaffolding.

## Clean notes (no finding ID)

| Area | Assessment |
|------|------------|
| `@kit/core` | Small modules (`errors` ~105, `logger` ~46, `parse` ~29); factories short; no god file |
| `@kit/types` | ErrorCode SSoT only; no product codes; no Zod bloat |
| `@kit/i18n` | Engine-only; catalogs app-owned — correct thinness |
| `@kit/auth` pure RBAC | `org-roles` / `module-grants` short, tested, used by `example-api` org services |
| Dual-auth path | `resolveDualAuth` linear, Bearer-first, fail-closed — not nested spaghetti |
| Storage path safety | `pushPathSegments` / `StorageClient` prefix checks are clear and tested |
| Email policy | Staging allowlist + From pin + subject prefix readable; wrappers composable |
| UI primitives | Most shadcn files well under 300 LOC; exemptions only for known heavy shells |

## Severity legend (STRATEGY)

| Level | Meaning |
|-------|---------|
| P0 | Security / extractibility broken (rare for pure smells) |
| P1 | Bug risk / critical drift |
| P2 | Refactor / medium debt / confirmed dual-path or DRY |
| P3 | Cleanup / hygiene / tracked exemptions |
