---
title: 'ADR-0013 — Root and GitHub workflow ownership (resolves ADR-0009 D3)'
status: accepted
normative: true
date: 2026-09-01
axial: false
related:
  - docs/kit/architecture/adr/0001-primary-axis-packages-compose-apps.md
  - docs/kit/architecture/adr/0009-kit-namespace-polarity-inheritance-marker.md
  - docs/kit/product-consumer-contract.md
  - config/kit/zero-edit-zones.json
---

# ADR-0013 — Root and GitHub workflow ownership (resolves ADR-0009 D3)

Closes [ADR-0009](./0009-kit-namespace-polarity-inheritance-marker.md) D3 assumed debt ([#110](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/110)): how root files and `.github/workflows/*` are owned in the zero-edit model.

## Context

ADR-0009 namespaced `{config,scripts,docs}/{kit,product}` and left root files plus GitHub workflows on an explicit `protected_files` list. That list was **not self-enforcing**: a newly added kit workflow that nobody added to `protected_files` was silently product-ownable.

GitHub only loads the **flat** `.github/workflows` directory. Nesting under `.github/workflows/kit/` is impossible — those files would never run.

Root files such as `package.json`, `biome.json`, `turbo.jsonc`, and `tsconfig.json` are auto-discovered by tools at the repository root. They cannot move under `config/kit/` without breaking that discovery.

`bun.lock` was already taken off the list as product workspace co-ownership ([#114](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/114)). This ADR does not re-add it.

## Alternatives considered

### Option 1 — Thin root façades → real files under `config/kit/*`

- **Pros:** polarity-pure; root becomes a pointer
- **Cons:** `package.json` cannot be a façade; root indirection breaks tool auto-discovery; buys no ownership clarity
- **Verdict:** **Rejected** (D3)

### Option 2 — Naming convention for `.github/workflows/*`

- **Pros:** GitHub's flat dir stays; product files are greppable; inventory gate can fail closed
- **Cons:** existing kit workflows keep their names (no `kit-` rename)
- **Verdict:** **Accepted** for workflows, low-churn form (D1)

### Option 3 — Keep the explicit `protected_files` list for root files

- **Pros:** no path churn; tools keep auto-discovery; ownership is documented per file
- **Cons:** the list is long; it shrinks only after a real move or an explicit product-ownership decision
- **Verdict:** **Accepted** for root files (D2, D4)

## Decision

### D1 — Workflows classified by convention

Reserved filename prefix `product-` marks **product-owned** workflows (`product-*.yml`).

Every other **tracked** workflow file under `.github/workflows` **MUST** appear in `protected_files`. An unlisted, non-`product-` workflow **FAILS** the inventory gate as unclassified.

GitHub only loads the flat `.github/workflows` dir, so nesting under `workflows/kit/` is impossible. Classification is naming convention + list.

Machine encoding in `config/kit/zero-edit-zones.json`:

- `workflow_dir`: `.github/workflows`
- `workflow_product_prefix`: `product-`

Gate messages (exact):

```text
check-zero-edit-zones: unclassified workflows under .github/workflows (name product-*.yml or add to protected_files):
  UNCLASSIFIED WORKFLOW <path>
workflow inventory gate failed (ADR-0009 D6, ADR-0013)
```

No existing workflow is renamed.

### D2 — Root files keep the explicit list

Root kit surfaces stay on `protected_files`. Per-file ownership of the current list (do not shrink here):

| Path | Why kit-owned |
|------|----------------|
| `lefthook.yml` | Local quality gates (pre-commit / commit-msg / pre-push); products must not fork hooks |
| `package.json` | Workspace root and kit scripts (`validate:full`, `zero-edit`, …); cannot be a façade |
| `turbo.jsonc` | Turborepo task graph; auto-discovered at repo root |
| `biome.json` | Formatter/linter; Biome auto-discovers at repo root |
| `tsconfig.json` | Root TypeScript compiler defaults |
| `AGENTS.md` | Agent constitution |
| `CLAUDE.md` | Claude entry (`@AGENTS.md`) |
| `README.md` | Kit onboarding and documentation pointer |
| `commitlint.config.js` · `.cjs` · `.mjs` · `.ts` | Conventional Commits config (all common extensions listed so whichever file exists stays protected) |
| `docker-compose.yml` | Local Mailpit email sink for kit demo |
| `.license-policy.json` | Allowed licenses for `licenseChecker` |
| `.claude/stack.yml` | Claude stack map (runtime, packages, docs path) |
| `.claude/settings.json` | Claude plugin and marketplace enablement |
| `.semctx/config.json` | semctx index include/exclude and blocking rules |
| `.github/dependabot.yml` | Dependabot bun + GitHub Actions update policy |
| `.github/workflows/ci.yml` | Primary CI gate (`bun run validate:full`); does not deploy |
| `.github/workflows/deploy-main.yml` | Retired no-op; showcase CD is Cloudflare Builds |
| `.github/workflows/secret-scan.yml` | CI TruffleHog secondary secret scan |
| `.github/workflows/merge-on-green.yml` | kit-ci App merge when `reviewed` + green |
| `.github/workflows/pr-title.yml` | Conventional Commits PR title check |
| `.github/workflows/dependabot-automerge.yml` | Label Dependabot patch/minor PRs `reviewed` |
| `.github/workflows/dependabot-alert-slack.yml` | Dependabot CVE alerts → Slack |
| `.github/workflows/close-linked-issues.yml` | Close issues referenced with closing keywords on merge |
| `.github/workflows/semctx.yml` | Semantic change-impact gate on PRs |

### D3 — Façades rejected

Option 1 is rejected: `package.json` cannot be a façade, root indirection breaks tool auto-discovery, and it buys no ownership clarity.

### D4 — `protected_files` shrinks only after a real move or explicit product ownership

The list does not shrink by deleting rules. A path leaves the list only after it is moved under a kit namespace (or otherwise relocated) **or** after an explicit product-ownership decision.

`bun.lock` stays **out** (kit [#114](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/114) — product workspace co-ownership). Do not re-add it.

## Consequences

### Positive

- The explicit list becomes **self-enforcing**: a new kit workflow that is not listed now fails the gate, instead of being silently product-ownable.
- Product consumers add workflows as `product-*.yml`.
- Root tool auto-discovery is unchanged.

### Negative

- Kit workflow filenames stay mixed (no `kit-` prefix); classification is prefix-for-product + list-for-kit.
- The root list remains long until a later move or ownership decision.

### Neutral

- Existing nine workflows are not renamed.
- ADR-0009 D1 / D6 are unchanged; this ADR only resolves D3.

## Non-goals

- Renaming existing workflows
- Moving `tooling/`
- Re-opening ADR-0009 D1 / D6
- Deleting workflow files

## Acceptance

- Workflow classification: `product-*.yml` = product-owned; every other tracked workflow **MUST** be in `protected_files`; unclassified fails the inventory gate
- Root files stay on the explicit list with per-file rationale; the list does not shrink in this ADR
- Façades rejected with recorded reasons
- `bun.lock` remains unprotected (#114)
- Consumer contract states the `product-*.yml` rule

## Refs

- Kit issue [#110](https://github.com/Roxabi/roxabi-boilerplate-cf/issues/110)
- [ADR-0009](./0009-kit-namespace-polarity-inheritance-marker.md) D3 / D6
- [`config/kit/zero-edit-zones.json`](../../../../config/kit/zero-edit-zones.json)
- [`scripts/kit/check-zero-edit-zones.sh`](../../../../scripts/kit/check-zero-edit-zones.sh)
