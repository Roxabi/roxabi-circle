# Debt tracking (kit)

> **SSoT** for suppression markers in Chemin A.  
> Inspiration: kit-factory debt-tracking — **simpler**: no full registry, no Python audit JSON.  
> Gate: `bun run debt:check` · self-test: `bun run test:debt` · CP-DEBT in [`testing.md`](./testing.md).

---

## Why

Biome / TypeScript strictness will tighten (plan 007 Phase C). Silent `biome-ignore` and
`@ts-expect-error` accumulate into invisible debt. This policy **surfaces** untagged and
stale markers on stderr so debt is **visible and reviewable**.

**Honest defaults (v1):** both gates start as **warn** (exit 0). A green `validate:full` does
**not** prove debt is managed until `DEBT_*_MODE=fail`. Expiry uses a **file last-commit
proxy** (any meaningful touch resets the clock), not line-level blame.

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
| Scope | `apps/**`, `packages/**` (`.ts` / `.tsx`) — not `scripts/kit/` / `tools/` |
| Slug | kebab-case: `[a-z0-9]+(-[a-z0-9]+)*` |
| Separator | `— DEBT:` or `- DEBT:` (em/en dash or hyphen before `DEBT:`) |
| Issue pin | optional `DEBT:<slug> #<N>` only (space + `#` immediately after slug) — **hard pin**: skips expiry forever until the pin is removed |
| Prefer | remove the suppression (fix root cause) over adding DEBT |

**Not scanned (v1):** `// @ts-nocheck`, file-level biome config, `tools/` / `scripts/kit/` helper ignores.

---

## Modes

| Gate | Env | Default | Fail when |
|---|---|---|---|
| **Untagged** | `DEBT_UNTAGGED_MODE=warn\|fail` | **warn** | `fail` + marker without `DEBT:<slug>` |
| **Expiry** | `DEBT_EXPIRY_MODE=off\|warn\|fail` | **warn** | `fail` + stale (see below) |
| **Grace** | `DEBT_EXPIRY_MONTHS` | **6** | — |

### Stale definition (expiry)

A `DEBT:` line is **stale** when **all** hold:

1. The **file** last git-commit date is older than `DEBT_EXPIRY_MONTHS` (file-level inactivity proxy, not marker blame — same as factory).
2. The marker has **no** issue pin of the form `DEBT:<slug> #<N>` (1–6 digits after the slug).

**Pin semantics:** `#N` after the slug is a **permanent expiry exemption** (no open-issue check). Use only for actively tracked remediation. Accidental `#rgb` / mid-reason hashes do **not** pin (pin must follow the slug).

Remediation: remove the debt · add `DEBT:slug #N` pin · or touch the file with a meaningful fix (resets the file-level clock for all markers in that file).

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
(`docs/kit/architecture/…`, `docs/kit/testing.md`, …). Bare `ADR-NNNN` as the only pointer is
discouraged (ADRs are provenance, not day-to-day law).

```bash
bun run agents-adr:check   # warn-only by default; AGENTS_ADR_MODE=fail to gate
```

Linked forms (`[ADR-0002](docs/kit/architecture/adr/…)`) are fine.

---

## Folder size (optional quality gate)

Companion to file length (`scripts/kit/check_file_length.sh`):

```bash
bun run folder-size:check
# QG_FOLDER_MAX (default 40), kit config/kit/folder_exemptions.txt, product config/product/folder_exemptions.txt
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
| `scripts/kit/check-debt.ts` | untagged + expiry scanner |
| `scripts/kit/check_folder_size.sh` | folder density |
| kit-factory `docs/kit/debt-tracking.md` | upstream inspiration |
