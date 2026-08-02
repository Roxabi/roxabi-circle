# Debt tracking (kit)

> **SSoT** for suppression markers in Chemin A.  
> Inspiration: roxabi-factory debt-tracking — **simpler**: no full registry, no Python audit JSON.  
> Gate: `bun run debt:check` · self-test: `bun run test:debt` · CP-DEBT in [`testing.md`](./testing.md).

---

## Why

Biome / TypeScript strictness will tighten (plan 007 Phase C). Silent `biome-ignore` and
`@ts-expect-error` accumulate into invisible debt. This policy makes every suppression
**tagged**, **time-bounded**, and **reviewable**.

---

## Grammar

Every suppression in **`apps/`** and **`packages/`** must carry `DEBT:<slug>` after the reason:

```ts
// biome-ignore lint/suspicious/noExplicitAny: FastMCP Zod boundary — DEBT:fastmcp-zod-boundary #68
// @ts-expect-error legacy binding — DEBT:legacy-wrangler-env #19
```

| Element | Rule |
|---|---|
| Markers scanned | `biome-ignore`, `@ts-expect-error`, `@ts-ignore` |
| Scope | `apps/**`, `packages/**` (`.ts` / `.tsx`) — not `scripts/` / `tools/` |
| Slug | kebab-case: `[a-z0-9]+(-[a-z0-9]+)*` |
| Separator | `— DEBT:` or `- DEBT:` (em/en dash or hyphen before `DEBT:`) |
| Issue ref | optional `#N` on the same line — **required** to pin expiry after grace |
| Prefer | remove the suppression (fix root cause) over adding DEBT |

**Not scanned (v1):** `// @ts-nocheck`, file-level biome config, `tools/` / `scripts/` helper ignores.

---

## Modes

| Gate | Env | Default | Fail when |
|---|---|---|---|
| **Untagged** | `DEBT_UNTAGGED_MODE=warn\|fail` | **warn** | `fail` + marker without `DEBT:<slug>` |
| **Expiry** | `DEBT_EXPIRY_MODE=off\|warn\|fail` | **warn** | `fail` + stale (see below) |
| **Grace** | `DEBT_EXPIRY_MONTHS` | **6** | — |

### Stale definition (expiry)

A `DEBT:` line is **stale** when **all** hold:

1. The **file** last git-commit date is older than `DEBT_EXPIRY_MONTHS` (file-level, not blame — same as factory).
2. The marker line has **no** issue ref `#N` (1–6 digits).

Remediation: remove the debt · open/attach `#N` · or touch the file with a meaningful fix (resets the clock).

**First land:** both gates default to **warn** (exit 0, stderr findings). Flip to `fail` after one sprint when the tree is tagged clean.

---

## Commands

```bash
bun run debt:check              # default warn/warn
DEBT_UNTAGGED_MODE=fail bun run debt:check
DEBT_EXPIRY_MODE=fail bun run debt:check
bun run test:debt               # CP-DEBT self-test (temp tree)
```

Wired into `validate:full` (warn defaults — does not block until mode=fail).

---

## Light registry (optional)

No per-slug `artifacts/debt/*.md` required in the kit. If a slug is reused often, add a row:

| Slug | Why it exists | Drain |
|---|---|---|
| `fastmcp-zod-boundary` | FastMCP + Zod infer mismatch | when FastMCP types stabilize |
| `modal-a11y-*` | Base UI modal patterns | product design pass |

Keep the table short; prefer issue refs on the marker line.

---

## AGENTS.md ADR hygiene (soft)

Operational rules in `AGENTS.md` should be **self-contained** or link a domain page
(`docs/architecture/…`, `docs/testing.md`, …). Bare `ADR-NNNN` as the only pointer is
discouraged (ADRs are provenance, not day-to-day law).

```bash
bun run agents-adr:check   # warn-only by default; AGENTS_ADR_MODE=fail to gate
```

Linked forms (`[ADR-0002](docs/architecture/adr/…)`) are fine.

---

## Folder size (optional quality gate)

Companion to file length (`tools/check_file_length.sh`):

```bash
bun run folder-size:check
# QG_FOLDER_MAX (default 40), roots apps packages, exemptions tools/folder_exemptions.txt
```

Included in `quality-gates:check` next to file length.

---

## What this does **not** cover

| Out | Why |
|---|---|
| Full factory debt registry + audit JSON | kit non-goal |
| Importlinter / ACL | N/A Chemin A |
| Silent Biome overrides in `biome.json` | separate policy |
| Product apps outside this monorepo | consumers own gates |

---

## Related

| Doc / gate | Role |
|---|---|
| [`testing.md`](./testing.md) · **CP-DEBT** | control-point inventory |
| [`plans/010-quality-hygiene-debt.md`](../plans/010-quality-hygiene-debt.md) | plan SSoT |
| `scripts/check-debt.ts` | untagged + expiry scanner |
| `tools/check_folder_size.sh` | folder density |
| roxabi-factory `docs/debt-tracking.md` | upstream inspiration |
