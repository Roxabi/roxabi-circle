# Architecture — P3+P4 (data · email · UI · i18n)

**Repo:** `roxabi-boilerplate-cf`  
**Date:** 2026-08-12  
**Scope:** `packages/db`, `packages/storage`, `packages/email`, `packages/ui`, `packages/i18n`  
**Axis:** ADR-0001 (packages = capabilities; schemas/catalogs/domain in apps) · ADR-0004 (email transports)

## Summary

Data and i18n packages are architecturally healthy and thin. `@kit/db` is a pure Drizzle/D1 factory with app-owned schemas; `@kit/storage` exposes a workers-types-free `KitR2Bucket` surface, path-safe keys, prefix-enforced `StorageClient`, and secret-free presign via injected `PresignSigner`. `@kit/email` is strongly aligned with ADR-0004 (log/smtp/cf/resend matrix, Node-only `/server`, staging D6 allowlist + From pin + subject prefix, token redaction). `@kit/i18n` is engine-only with app-owned catalogs — correct axial split. Main gaps are in `@kit/ui`: public export of `AppSidebar` with hardcoded shadcn sample data (unused by `example-web`), shell blocks with fixed English chrome strings, and a few hygiene items (duplicate `escapeHtml`, incomplete template re-exports, weak `createDb` D1 typing, free R2 helpers without prefix). No P0; no product-domain (share) leakage in these packages.

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| F1 | P2 | `packages/ui/src/components/app-sidebar.tsx` | Kit public API ships a full sidebar **with hardcoded sample data** (Acme / shadcn / Playground / Design Engineering), not data-driven composition | Lines 22–150 define const `data` with fake orgs/nav; `AppSidebar` always binds that data; exported from `packages/ui/src/index.ts` L2; **no consumer** in `example-web` (app uses `app-shell.tsx` + `NavUser` only) | Make `AppSidebar` fully prop-driven **or** stop exporting it from `@kit/ui` (keep as design-system story/fixture under app or unexported demo). Prefer composing `NavMain` / `NavUser` / `TeamSwitcher` from apps |
| F2 | P2 | `packages/ui/src/components/nav-main.tsx`, `nav-projects.tsx`, `team-switcher.tsx` | Shell chrome labels are **hardcoded English** in the kit package (not label props / i18n) | `NavMain` L30 `"Platform"`; `NavProjects` L33 `"Projects"`, L55–64 `"View Project"` / `"Share Project"` / `"Delete Project"`; `TeamSwitcher` L59 `"Teams"`, L80 `"Add team"`. Contrast `date-picker.tsx` comment: app-owned i18n strings | Accept optional `labels` props (or `groupLabel` / action strings) so products and `example-web` can pass FR/EN catalogs; default EN ok for shadcn parity but must not force EN product UI |
| F3 | P2 | `packages/db/src/index.ts` | `createDb` types D1 as `unknown` and casts `as never` — boundary erases binding safety | L5–6: `export function createDb<TSchema …>(d1: unknown, schema: TSchema) { return drizzle(d1 as never, { schema }) }` | Type `d1` as Drizzle’s D1 client param (or minimal `{ prepare: … }` interface) so wrong bindings fail at compile time; keep schema generic |
| F4 | P3 | `packages/storage/src/index.ts` | Free `putObject` / `getObject` / `deleteObject` only assert path safety — **no base-prefix isolation** | L67–85 call `assertObjectKey` only; README and L88–90 prefer `StorageClient` for prefix enforcement; dogfood uses `StorageClient` (`notes.ts`, `uploads.ts`) | Document as “unsafe footgun / tests only” or deprecate free helpers in favor of `StorageClient`; consider `@internal` / JSDoc `@deprecated` if product forks copy free helpers |
| F5 | P3 | `packages/storage/src/index.ts` | `StorageClient` constructor validates `basePrefix` with `includes('..')`, not the same segment walker as `joinObjectKey` | L96–98 vs `pushPathSegments` L33–41 used by `joinObjectKey` | Construct via `joinObjectKey(basePrefix)` (or shared assert) so empty / `.` / `..` segment rules are identical |
| F6 | P3 | `packages/email/src/templates/*.ts` | `escapeHtml` copied in **five** template modules (N×M inside package) | Identical private `escapeHtml` in `demo.ts`, `invite.ts`, `magic-link.ts`, `reset-password.ts`, `welcome-set-password.ts` | Extract once to `packages/email/src/html.ts` (or next to `redact.ts`) |
| F7 | P3 | `packages/email/src/index.ts` | Public re-export surface omits `MagicLinkEmail` while other templates are re-exported | L429–432 re-export `DemoEmail`, `InviteEmail`, `ResetPasswordEmail`, `WelcomeSetPasswordEmail`; `MagicLinkEmail` only used via `buildMagicLinkEmailText` (import L5, no `export { MagicLinkEmail }`) | Re-export `MagicLinkEmail` for parity with other kit templates |
| F8 | P3 | `packages/email/src/templates/*` | Transactional templates are **EN-only** “Kit Kit” copy; no locale parameter despite kit FR-default UI and ADR-0004 D5 “locale-aware later” | e.g. `invite.ts` L24–35 subjects/body EN; AGENTS i18n default FR | When promoting multi-locale mail: `locale?: 'fr' \| 'en'` on builders **or** move copy to app catalogs and keep package as structure-only; not a product-domain leak today |
| F9 | P3 | `packages/db/src/index.ts` | `mapInChunks` / `D1_IN_ARRAY_CHUNK` have **no app call site** yet (utility-only) | Grep: only `packages/db/src/index.ts` + `index.test.ts` | Keep until first multi-id IN query; then use from repos in `example-api` to prove D1 bind-limit ergonomics |
| F10 | P3 | `packages/ui/src/components/ui/sidebar.tsx` | Large owned shadcn primitive (~682 LOC) is the natural god-file hotspot for UI | Single module hosts provider, mobile sheet, rail, menu primitives | Acceptable as owned shadcn source; split only if quality-gates LOC threshold fires — do not invent product UI inside it |

### Clean / aligned (no finding ID)

| Area | Assessment |
|------|------------|
| **D1 / `@kit/db` boundary** | Schema tables live in apps (`apps/example-api/src/db/schema.ts`); package comment “Schemas live in apps”; request-scoped `createDb` via `withDb` middleware. No product domain in package. |
| **R2 purity** | Minimal `KitR2Bucket` / `KitR2ObjectBody` avoids workers-types DOM coupling; no R2 secrets in package; `createPresignedUrl` validates key then delegates to app `PresignSigner`; mock signer for CI. |
| **Email ADR-0004** | Transports `log \| smtp \| cf \| resend`; `assertEmailTransportAllowed` bans log on staging/prod and smtp on Worker factory; `createEmailPort` fail-closed without binding/key; D6 staging allowlist + `@example.com` From + `[TEST STAGING]` subject; `redactEmailBody` on log path; `/server` SMTP Node-only export. App wires via `apps/example-api/src/lib/email-port.ts`. |
| **UI shadcn ownership** | `components.json` pins `base-nova` + Base UI; primitives under `components/ui/*`; kit-owned sources, not npm black-box. No share-product domain components. |
| **i18n engine vs catalogs** | `createI18n` takes app catalogs; package ships **zero** message strings; `apps/example-web/src/lib/i18n.ts` + `messages/{fr,en}.ts` is the correct composition. |
| **Package isolation** | None of db/storage/email/ui/i18n import apps or each other (email internal modules only). |

## Metrics

- **Files reviewed (source, excl. node_modules):** ~60  
  - db: 2 · storage: 2 · email: 11 · i18n: 2 · ui: ~45 (components + hooks + lib + styles)  
- **Consumer touchpoints sampled:** `example-api` middleware/db, email-port, notes/uploads/presign; `example-web` i18n + app-shell / design-system imports  
- **Issues:** P0=0 · P1=0 · P2=3 · P3=7  
- **Notable hotspots:**  
  - `packages/ui/src/components/app-sidebar.tsx` (sample data export)  
  - `packages/ui/src/components/ui/sidebar.tsx` (~682 LOC)  
  - `packages/email/src/index.ts` (ADR policy surface — well structured)  
  - `packages/storage/src/index.ts` (dual free vs prefix client API)  
- **Axial health (this slice):** schemas/catalogs/domain **out** of packages ✓ · email transport matrix **in** package ✓ · UI shell data **should** be out (F1)  

## Recommendations

1. **Demote or prop-drive `AppSidebar` (F1)** — highest kit-hygiene win; prevents products cloning Acme sample nav as “official kit shell.” Align with live `example-web` `app-shell` pattern.
2. **Label props on shell blocks (F2)** — match FR-default i18n story without putting catalogs into `@kit/ui`.
3. **Tighten `createDb` D1 typing (F3)** — small change, better Worker binding correctness for consumers.
4. **R2: prefer single safe path (F4–F5)** — document/deprecate free helpers; unify prefix validation.
5. **Email polish (F6–F8)** — shared `escapeHtml`, complete re-exports, plan locale on builders when transactional FR ships (ADR D5 already anticipates).
6. **Do not expand `@kit/db` schemas or `@kit/i18n` catalogs** into packages — current axial split is correct; preserve it.
7. **Keep email ADR-0004 enforcement in package** (not reimplemented per product app) — current `createEmailPort` + app thin `resolveEmailPort` is the right layering.

## Severity legend (STRATEGY)

| Level | Meaning |
|-------|---------|
| P0 | Security / extractibility broken |
| P1 | Bug risk / critical axial drift |
| P2 | Refactor / probable drift / medium debt |
| P3 | Cleanup / hygiene |
