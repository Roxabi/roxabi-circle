# Plan 006: Optional kit FE polish (dogfood + docs)

> **Executor instructions**: **Optional wave.** Only start after plans **002** and **005** are DONE and operator confirms W5. Prefer one PR separate from W0–W4. Update `plans/README.md` when done.
>
> **Drift check**:
> ```bash
> git diff --stat 3ae7932..HEAD -- apps/example-web packages/ui/src/index.ts docs/
> ```

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW–MED (Select a11y)
- **Depends on**: plans/002-fix-design-system-e2e-ba.md, plans/005-auth-org-characterization-tests.md
- **Category**: direction | dx | docs
- **Planned at**: commit `3ae7932`, 2026-07-31

## Why this matters

Kit exports `AlertDialog`, `Empty`, `Select` but example-web still uses `window.confirm`, native `<select>`, and ad-hoc empty dashed boxes. That trains product forks on the wrong pattern and weakens Goal 002 “product-ready” FE proof. This plan is **polish**, not correctness P0.

## Current state

- Keys revoke: `apps/example-web/src/routes/keys.tsx` ~`window.confirm(m.confirmRevoke)`
- Notes delete: custom `Dialog` destructive (OK) — standardize revoke on `AlertDialog`
- OrgPicker: native select in `app-shell.tsx` ~127-137
- Org members invite role: native select + raw EN role strings `admin|member|reader`
- `packages/ui` exports Empty, Select, AlertDialog via `packages/ui/src/index.ts`
- Design-system page: `routes/design-system.tsx` incomplete for those primitives
- Zero-edit: brand/tokens override in **app CSS**, never patch `packages/ui` for brand

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Typecheck web | `bun run --filter @gosilex/example-web typecheck` | exit 0 |
| Test web | `bun run --filter @gosilex/example-web test` | exit 0 |
| i18n | `bun run i18n:check` | exit 0 |
| E2E (servers up) | `bun run --filter @gosilex/example-web test:e2e:design-system` | exit 0 |

## Scope

**In scope (pick all or a subset — document which in PR):**

1. **Keys revoke** → `AlertDialog` from `@gosilex/ui` (same mutation)
2. **i18n role labels** for invite/org display (`roleOwner`, `roleAdmin`, …) in `messages/fr.ts` + `en.ts` — wire values stay English enums
3. **OrgPicker and/or invite role** → `@gosilex/ui` `Select` (if time; else stop after i18n labels)
4. **One empty state** (notes or keys) → `Empty` primitives from ui
5. **Design-system** short sections for AlertDialog + Empty (and Select if used)
6. **Docs**: short `docs/ui-kit.md` OR `packages/ui/README.md` — export map, “compose in app”, link consumer contract zero-edit, link `/admin/design-system`

**Out of scope:**
- Injecting FR labels into `packages/ui` dialog “Close” (DIR-02 package API — separate design)
- Code-splitting routes
- Raising coverage floors
- Product branding tokens in kit
- Splitting `app-shell.tsx` for its own sake

## Git workflow

- Branch: `feat/fe-w5-kit-polish`
- Commit style: `feat(example-web): dogfood AlertDialog Empty Select; docs ui kit`
- Separate PR from W0–W4

## Steps

### Step 1: AlertDialog on keys revoke

Replace `window.confirm` with AlertDialog open state; confirm button calls existing revoke mutation. Keep copy from `m.confirmRevoke` / existing strings.

**Verify**: typecheck; manual revoke still works.

### Step 2: Role label messages

Add FR/EN labels for org roles used in UI. Use in `org-members.tsx` and any badge display that shows raw role. **Do not** change API payloads.

**Verify**: `bun run i18n:check`.

### Step 3 (optional): Select + Empty dogfood

- Swap OrgPicker native select → ui Select **or** only invite role select (smaller).
- Notes empty state → `Empty` + `EmptyHeader` / whatever the package exports (read `packages/ui/src/components/ui/empty.tsx` before use).

If Select a11y breaks e2e or keyboard: revert Select, keep labels + AlertDialog.

### Step 4: Design-system demos

Add minimal live demos so e2e overlays still pass (don’t remove existing overlay anchors used by e2e).

**Verify**: e2e design-system exit 0.

### Step 5: Docs page

One short markdown file:

- What `@gosilex/ui` is for
- App owns catalogs/shells
- Theme via CSS variables after `@import "@gosilex/ui/styles.css"`
- Link `docs/product-consumer-contract.md` design_overrides
- Link local route `/admin/design-system`

## Test plan

- No hard requirement for new unit tests if components are thin wrappers.
- E2E must stay green.
- i18n contract must stay green.

## Done criteria

- [ ] At least AlertDialog revoke **or** documented subset shipped
- [ ] Role labels i18n if members UI touched
- [ ] Docs file exists and is accurate
- [ ] typecheck + web tests + i18n:check exit 0
- [ ] e2e design-system exit 0 (with servers)
- [ ] `plans/README.md` 006 → DONE or REJECTED (operator skipped W5)

## STOP conditions

- Select/Base UI interaction regresses e2e after one fix attempt — drop Select, keep rest.
- Docs would require inventing API not in package — document only real exports from `index.ts`.
- Operator says skip W5 — mark REJECTED in README with reason “deferred polish”.

## Maintenance notes

- Reviewer: zero-edit compliance — no brand tokens in `packages/ui`.
- Follow-up: package-level `UiLabels` context for Close/Sidebar (DIR-02) remains future work.
