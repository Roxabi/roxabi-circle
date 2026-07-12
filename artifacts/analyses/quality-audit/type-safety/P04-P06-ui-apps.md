# Type Safety — P4–P6 (ui · example-api · example-web · mcp-example)

**Date:** 2026-07-12  
**Partition:** `packages/ui/**`, `apps/example-api/**`, `apps/example-web/**`, `apps/mcp-example/**`  
**Domain focus:** `any` / `as` / non-null `!`, untyped fetch bodies, env typing, form typing  
**Excluded:** `node_modules/`, `coverage/` HTML (metrics only)  
**Refs:** STRATEGY.md · AGENT_PROMPTS Type Safety · AGENTS stack (Zod double frontière, Form+Zod, env Zod)

## Summary

Type safety across the UI kit and example apps is **strong on the axis “no `any` / no suppressions”** and **uneven on runtime↔type coupling**. `@gosilex/ui` is largely free of type holes (only CSS custom-property casts). `example-api` validates mutation bodies with Zod and types Hono as `AppEnv`, but **auth subject is optional in `AppVariables` and forced with `!` after imperative `requireAuth`**, and env Zod is inventory-only at runtime. `example-web` trusts `apiFetch<T>` success JSON with a bare `as T`, has **no Zod dependency**, and uses TanStack Form **without validators** (HTML `required` only). `mcp-example` is small and well constrained (tool name SSoT + empty Zod params). **No P0.** Highest leverage fixes: typed auth guard that returns `subject`, and runtime-validated (or shared) API response schemas on the client.

## Findings

| ID | Severity | File | Finding | Evidence |
|----|----------|------|---------|----------|
| TS-P04-001 | — | `packages/ui/**` | **Positive: zero `any` / `as any` / `@ts-ignore` / `@ts-expect-error`.** | Ripgrep over `packages/ui` `*.{ts,tsx}`: no `: any`, `as any`, suppressions. Strict base `tsconfig` inherited. |
| TS-P04-002 | — | `button.tsx`, `field.tsx`, CVA components | **Positive: public component props are VariantProps + DOM/primitive props, not loose bags.** | e.g. `ButtonPrimitive.Props & VariantProps<typeof buttonVariants>`; Field/Table/Card use `React.ComponentProps<'div'|…>`. |
| TS-P04-003 | P3 | `sidebar.tsx:124,180,596`; `sonner.tsx:32` | **CSS custom-property objects asserted to `CSSProperties`.** | `{ '--sidebar-width': … } as React.CSSProperties` (×3); Sonner `{ '--normal-bg': … } as CSSProperties`. Standard shadcn pattern (index signature vs CSS var names); low risk, cosmetic for React 19 CSS var typing. |
| TS-P04-004 | P3 | `skeleton.tsx:3` | **`React.ComponentProps` without local React import.** | File only imports `cn`; uses `React.ComponentProps<'div'>`. Compiles via `@types/react` `export as namespace React` once any sibling imports `react`, but is fragile hygiene vs `import type * as React` used elsewhere. |
| TS-P05-001 | — | `routes/auth.ts`, `routes/notes.ts` | **Positive: request bodies Zod-validated at route boundary.** | `loginSchema.safeParse(raw)` / `createNoteSchema.safeParse(raw)` after `c.req.json().catch(() => null)`; failures → `AppError.validation` + `fieldErrors`. |
| TS-P05-002 | — | `env.schema.ts`, `env.ts`, `types.ts` | **Positive: Worker string env has Zod SSoT + `Env` bindings typed.** | `workerStringEnvSchema` → `WorkerStringEnv`; `Env = WorkerStringEnv & { DB; BUCKET }`; `AppEnv = { Bindings: Env; Variables: AppVariables }`. |
| TS-P05-003 | P1 | `middleware/request-id.ts:3–7`; `routes/notes.ts:21,35,46,54`; `routes/me.ts:12,24` | **`subject` stays optional; handlers use non-null assertion after `requireAuth`.** | `AppVariables.subject?: string` · `authMethod?: 'session' \| 'api_key'`. Six production sites: `c.get('subject')!`. Type system does **not** prove `requireAuth` ran; omitting the call still typechecks and yields `undefined` at runtime. Prefer `requireAuth(c): Promise<{ subject; authMethod }>` or middleware that narrows Variables. |
| TS-P05-004 | P2 | `env.schema.ts:20–30`; `index.ts` | **Env Zod not applied at Worker bootstrap; all string keys optional.** | Schema documents SESSION_SECRET / ENVIRONMENT / CORS / SMTP as optional; `parseWorkerStringEnv` unused on hot path. Fail-closed is runtime `getSecret` only — correct for secrets, weak for typos (`ENVIRONMENT=prod` vs `production`) at type/runtime. |
| TS-P05-005 | P2 | `middleware/error-handler.ts:21` | **`status as ContentfulStatusCode` without brand/check.** | `toApiErrorBody` returns numeric status; cast silences Hono’s literal status union. Safe if `toApiErrorBody` only emits HTTP codes; no local assert. |
| TS-P05-006 | P3 | `services/email.ts:30–38` | **`globalThis as { connect?: … }` for Workers TCP.** | Escape hatch for CF `connect()` not on lib types. Prefer typed ambient or `@cloudflare/workers-types` socket API when available. |
| TS-P05-007 | P3 | `seed/demo-data.ts:59–62` | **Non-null on fixed seed array indices.** | `SEED_USERS[0]!.email` etc. Array is length-2 constant; could be a tuple/`satisfies` and drop `!`. |
| TS-P05-008 | P3 | `app.test.ts`, `test/memory-env.ts`, `scripts/seed-local.ts` | **Tests/tooling: heavy `as` on JSON / D1 doubles (acceptable, tracked).** | ~15× `(await res.json()) as {…}` in `app.test.ts`; `as unknown[][]` / `as never` for D1 stubs; seed-local `as Record<string, unknown>[]` + `rows[0]!`. Not production ship path. |
| TS-P05-009 | — | `services/notes.ts`, `repos/*`, `db/schema.ts` | **Positive: service/repo inputs typed; Drizzle schema drives row shapes.** | Explicit note create input; `DrizzleD1Database<typeof schema>`; no `any` in services/repos. |
| TS-P06-001 | P1 | `example-web/src/lib/api.ts:21–46` | **`apiFetch<T>` trusts caller generic: success body is `return data as T`.** | Parses to `unknown`, then unchecked `as T`. Wrong call-site type (e.g. missing fields) is silent until UI crash. Error path: `data as ApiErrorBody` with only `body?.error?.code` runtime check — not Zod. Kit template will be copied into product apps. |
| TS-P06-002 | P2 | `example-web` forms (`login.tsx`, `notes.tsx`) | **TanStack Form without Zod / validators; no `zod` package on web.** | `useForm({ defaultValues, onSubmit })` only. Login: no `validators` / email shape. Notes: HTML `required` on title only; body unconstrained. BE still validates — but AGENTS “TanStack Form + Zod” and “Zod double frontière” not met on FE. Field errors from API not mapped to form fields. |
| TS-P06-003 | P2 | `notes.tsx:34`; `auth.ts:6–11`; call sites | **Hand-rolled response DTOs not shared with API; mild shape drift.** | FE `Note = { id, title, body, createdAt }` omits `subject`; `MeResponse.authMethod: string` vs API `'session' \| 'api_key'`; `role: KitRole` unvalidated after `as T`. Duplicate `KitRole` in web `auth.ts` vs api `seed/demo-data.ts` (not same module). |
| TS-P06-004 | P2 | `api.ts:3`; no `src/vite-env.d.ts` | **`VITE_API_URL` only via `import.meta.env` + vite/client defaults.** | `const API_BASE = import.meta.env.VITE_API_URL ?? ''`. No app-level `ImportMetaEnv` interface documenting required/optional kit vars (proxy default often empty string — OK for same-origin, untyped for deploy). |
| TS-P06-005 | P3 | `theme.tsx:50,53` | **Redundant casts: `applyTheme` already returns `'light' \| 'dark'`.** | `setResolved(applyTheme(theme) as 'light' \| 'dark')` — cast is dead weight / hides if return type regresses. |
| TS-P06-006 | P3 | `app-shell.tsx:67` | **Non-null on modular theme order index.** | `order[(i + 1) % order.length]!` — length 3 fixed; prefer `order.at(...) ?? 'system'` or tuple. |
| TS-P06-007 | — | `messages/fr.ts` + `en.ts` + contract test | **Positive: i18n keys type-checked (`en: Messages`); runtime non-empty contract test.** | TypeScript is SSoT for key parity; test casts `Object.keys` only for iteration. |
| TS-P06-008 | — | `mcp-example/src/index.ts` | **Positive: tool registration exhaustiveness via typed Record + Zod params.** | `toolHandlers: Record<(typeof REGISTERED_TOOL_NAMES)[number], …>`; `parameters: z.object({})`; boot assert vs `@gosilex/mcp` allowlist. |
| TS-P06-009 | P3 | `mcp-example/src/index.ts:38` | **`process.env as Record<string, string \| undefined>`.** | Bun/Node `ProcessEnv` is already string-indexable; cast papers over exact env typing. Prefer helper accepting `NodeJS.ProcessEnv` / Bun env type from `@gosilex/mcp`. |
| TS-P06-010 | — | All four partitions | **Positive: no `any`, no `as any`, no `@ts-nocheck` / `@ts-ignore` / `@ts-expect-error` in partition sources.** | Full-partition grep clean for those tokens. |

## Metrics

| Metric | P4 ui | P5 example-api | P6 web | P6 mcp | **Total** |
|--------|------:|---------------:|-------:|-------:|----------:|
| Source files analyzed (approx. `src/**/*.{ts,tsx}` + relevant scripts) | 27 | 28 | 24 | 2 | **~81** |
| `any` / `as any` | 0 | 0 | 0 | 0 | **0** |
| `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` | 0 | 0 | 0 | 0 | **0** |
| Production type assertions `as …` (excl. import renames / `as const`) | 4 | 3 | 5 | 1 | **13** |
| Production non-null `!` | 0 | 10 | 1 | 0 | **11** |
| Test/tooling `as` / `!` (approx.) | 0 | ~20 | 1 | 0 | **~21** |
| Zod usage (modules importing `zod`) | 0 | 3 | **0** | 1 | **4** |
| Route handlers with Zod body parse | — | 2 (login, create note) | — | tools empty object | |
| Forms with Zod validators | — | — | **0 / 2** | — | |
| Untyped / caller-trusted fetch success bodies | — | n/a (server) | **`apiFetch<T>` core** | n/a | |
| Env: typed + runtime gate | n/a | Zod inventory + `getSecret` fail-closed | Vite client only | process.env cast | |

### Issues by severity

| Severity | Count | IDs |
|----------|------:|-----|
| **P0** | **0** | — |
| **P1** | **2** | TS-P05-003, TS-P06-001 |
| **P2** | **5** | TS-P05-004, TS-P05-005, TS-P06-002, TS-P06-003, TS-P06-004 |
| **P3** | **8** | TS-P04-003, TS-P04-004, TS-P05-006, TS-P05-007, TS-P05-008, TS-P06-005, TS-P06-006, TS-P06-009 |
| Positives (tracked) | 8 | TS-P04-001/002, TS-P05-001/002/009, TS-P06-007/008/010 |

**Issue total (actionable):** 15 (P0:0 · P1:2 · P2:5 · P3:8)

### Partition health (type-safety lens)

| Partition | Grade | Note |
|-----------|-------|------|
| P4 `packages/ui` | **A** | Kit-grade props typing; only CSS cast noise |
| P5 `example-api` | **B+** | Zod bodies + Env types; subject `!` + optional env schema |
| P6 `example-web` | **B−** | Strict TS compile, weak wire types + forms |
| P6 `mcp-example` | **A−** | Exhaustive tools; minor env cast |

## Recommendations

1. **P1 — Auth subject without `!`:** Change `requireAuth` to return `{ subject, authMethod }` (or Hono middleware + typed Variables after guard). Handlers use return value; delete `c.get('subject')!`. Optionally assert-throw helper `getSubject(c): string` that throws `UNAUTHORIZED` if missing (safe if middleware forgotten).
2. **P1 — Harden `apiFetch`:** Add optional Zod schema parameter `apiFetch(path, init, schema)` or companion `apiFetchJson(schema, …)` that `safeParse`s success bodies; keep generic overload for progressive adoption. At minimum, Zod-parse `ApiErrorBody` on `!res.ok`.
3. **P2 — FE forms = TanStack Form + Zod:** Add `zod` to `example-web`; share or mirror `loginSchema` / `createNoteSchema` (export from `@gosilex/types` or app `schemas/`); wire `validators.onChange` / `onSubmit`; map API `fieldErrors` into FieldError.
4. **P2 — Shared DTOs:** Co-locate response schemas (`MeResponse`, `NoteListResponse`) in a types package or example shared module used by tests + web; type `authMethod` as the same union as API Variables.
5. **P2 — Env:** Document runtime policy; optionally `parseWorkerStringEnv` in a cold-start middleware for non-secret string vars; tighten `ENVIRONMENT` to `z.enum([...]).optional()`.
6. **P3 — Cleanup:** Drop redundant theme casts; replace seed/theme `!` with tuples; `import type * as React` in `skeleton.tsx`; CSSProperties casts can stay or use `React.CSSProperties & Record<`--${string}`, string>`.

## Residual risks / not covered

- Did **not** re-run `tsc` in this agent turn; counts are static analysis. CI/typecheck green is assumed from kit state.
- Product `apps/share-*` absent — not in partition.
- Better Auth migration will reshape session types; interim HMAC types not deeply re-audited beyond Variables.
- Base UI primitive prop variance / generics inside `node_modules` skipped (`skipLibCheck: true`).
- Playwright e2e scripts (`.mjs`) are untyped by design — out of scope.
- Full dual-boundary Zod for every GET response is optional for demo scale; risk grows when cloning kit into multi-client product.

---

**Output path:** `artifacts/analyses/quality-audit/type-safety/P04-P06-ui-apps.md`  
**Agent:** types-P4-P6  
