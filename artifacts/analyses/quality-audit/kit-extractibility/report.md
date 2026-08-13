# Kit Extractibility — Full domain audit

| | |
|---|---|
| **Domain** | Kit Extractibility |
| **Partition** | packages · apps/example-* · mcp-example · scripts · tools · config · consumer docs |
| **Date** | 2026-08-12 |
| **SSoT gates** | `scripts/check-banned-strings.sh` · `scripts/extract-dry-run.sh` · `scripts/check-zero-edit-zones.sh` · `config/zero-edit-zones.json` · `docs/product-consumer-contract.md` |
| **Machine baseline** | banlist OK · extract-dry-run OK (mode=kit) · zero-edit OK (kit mode) — Wave 0 [`../axial-drift/machine-baseline.md`](../axial-drift/machine-baseline.md) |
| **Primary claim** | Extractible multi-tenant **capability kernel**: 0 product domain in packages + examples; packages composed by examples; consumer zero-edit contract |

## Summary

The kit’s **machine extractibility bar is real and green**: banlist, extract dry-run (tree + import + orphan + ADR), and zero-edit config validation all pass on this kit-only tree (no `apps/share-*`). All **14** workspace packages under `packages/*` have importers outside themselves (examples or sibling packages / tsconfig); incubating `@kit/flows` · `@kit/tasks` · `@kit/comments` are dogfooded from `example-api`. Product-frame tokens from AGENTS (`private_acl`, `private_key` product mode, `share/{slug}`, Shlink, …) do **not** appear under packages or example sources.

Residual risk is **process / completeness**, not a present domain leak:

1. **Banlist is a small hard compound list**, not a full product lexicon — intentional, but several frame tokens are unguarded (`private_acl`, bare `private_key`, `SLUG_EXISTS`, `share-mcp`).
2. **`tools/` is kit quality infrastructure but outside zero-edit zones** while `scripts/` and `tooling/` are protected — dual-edit hole for quality gates / import-boundary exemptions.
3. **Dogfood evidence docs are empty templates** while AGENTS marks B5 consumer dogfood as done with a permanent greenfield — claim vs artifact drift.
4. **CP-EXTRACT honestly does not** drop product apps and re-run lint/typecheck/test (AGENTS open checkbox).

**Verdict:** extractibility claim is **substantially met for kit-as-upstream**. No P0 product-domain contamination in packages/examples. Highest follow-ups: protect `tools/`, fill dogfood evidence, close banlist + zero-edit coverage gaps, optionally extend extract required-imports for incubating packages.

---

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| KE-01 | **P1** | `config/zero-edit-zones.json` · `tools/**` | **`tools/` not in zero-edit protected_prefixes** while it owns license + quality-gates + import-boundary exemptions and is on the same architecture-gates axis as `scripts/` | Zones protect `scripts/`, `tooling/`, `config/` only. `package.json` scripts: `license:check` → `tools/licenseChecker.ts`; `quality-gates:check` → `tools/check_file_length.sh` + `check_folder_size.sh`; CP-IMPORT exemptions → `tools/import-boundary-exemptions.txt`. `docs/testing.md` groups **`scripts/*` / `tools/*`** as architecture gates. Product dual-edit of `tools/file_exemptions.txt` / `qg.conf` / license checker would soft-fail product quality without zero-edit red. | Add `"tools/"` to `protected_prefixes`. Document in consumer contract next to scripts. Keep product helpers under `scripts/product/` only. |
| KE-02 | **P1** | `docs/product-consumer-dogfood-evidence.md` · `AGENTS.md` L670 | **B5 dogfood claimed complete; evidence file is still a blank template** | AGENTS checklist: *Consumer dogfood zero-edit (B5) … permanent greenfield product-dogfood … evidence docs/product-consumer-dogfood-evidence.md*. Evidence file fields are all `(fill)` — no repo URL, date, or log. `platform-proof.md` named dogfood product also `_TBD_`. Harness `scripts/dogfood-zero-edit.sh --self-sim` exists and is the real local proof; permanent greenfield is not recorded in-repo. | Fill evidence with real product remote (or self-sim run log + date) **or** demote AGENTS checkbox to partial (harness only) until permanent dogfood is named. Do not claim “permanent greenfield” without filled SSoT. |
| KE-03 | **P2** | `scripts/check-banned-strings.sh` | **Banlist coverage is narrow vs product frame + ADR-0001 anti-patterns** | `BANNED`: `share/{slug}`, `share_publish`, `private_key_product`, `apps/share-`, `shlink`, `s.example.com`, `share.example.com` + `joinObjectKey('share'`. ADR-0001 / AGENTS frame also cite `private_acl`, product `private_key` mode, `SLUG_EXISTS`, `share-mcp`. Grep on packages+apps: those tokens **absent** today — but gate would not catch a first leak of `private_acl` / bare `private_key` product mode / `SLUG_EXISTS`. Tests excluded (`*.test.ts`) so test-only product strings also pass CP-BAN. | Extend banlist with high-signal compounds: `private_acl`, `\bprivate_key\b` (or keep `private_key_product` + add `private_acl`), `SLUG_EXISTS`, `share-mcp`, `apps/share`. Optionally scan tests or a dedicated `*.test.ts` allowlist. Keep false-positive review (tasks visibility `'shared'` must stay). |
| KE-04 | **P2** | `config/zero-edit-zones.json` vs `docs/product-consumer-contract.md` | **Contract kit-owned files missing from `protected_files`** | Contract zones table: `biome.json` · `turbo.jsonc` · **`tsconfig.json`** · commitlint · **AGENTS / root README** · kit workflows. Zones protect biome, turbo, commitlint*, AGENTS, CLAUDE, listed workflows — **not** root `tsconfig.json`, **not** `README.md`, **not** `docker-compose.yml`, **not** newer workflows (`close-linked-issues.yml`, `semctx.yml`, `secret-scan-history.yml`, `dependabot-alert-slack.yml`). Product can dual-edit those without exception. | Align `protected_files` with contract (at least `tsconfig.json`, `README.md`). Prefer `protected_prefixes: [".github/workflows/"]` **or** explicit list of all kit workflows + keep product free via `product-*.yml` allow pattern already documented. |
| KE-05 | **P2** | `config/zero-edit-exceptions.example.json` | **Exception template missing required `version: 1`** | Checker (`check-zero-edit-zones.sh` NODE): if exceptions file exists, `exceptionsDoc.version !== 1` → die. Example only has `{ "exceptions": [...] }` — no `version`. Product copy-paste → immediate zero-edit fail. | Add `"version": 1` to example; mirror in contract snippet. |
| KE-06 | **P2** | `scripts/extract-dry-run.sh` | **CP-EXTRACT is structural only — no post-drop suite; required package list lagging incubating kernels** | Docs CP-EXTRACT: required tree, banlist, import graph, orphan packages, ADRs — **does not** re-run lint/typecheck/test after simulated drop. AGENTS open: *Extract dry-run « suite green after drop product »*. `required[]` omits `packages/{flows,tasks,comments,api-client,i18n}/package.json` (orphan+import checks still cover usage). Hard-coded example imports omit `@kit/flows` · `@kit/tasks` · `@kit/comments` · `@kit/api-client` (orphan fail would catch zero external refs only). | Keep honesty (already good). Optional harden: add incubating packages to `required[]` + `search_q` dogfood imports in example-api/web; long-term: EXTRACT_MODE that excludes product pathspecs and runs `typecheck`/`test` subset. |
| KE-07 | **P3** | `packages/mcp/src/index.ts` `assertNoShareTools` | **Deprecated helper name implies share ban; implementation only validates identifier shape** | L56–62: loops names with `/^[a-z][a-z0-9_]*$/i` only — **does not** reject `share_*`. Comment: prefer banlist. Tests assert shape only. Misleading for agents scanning for “no share tools.” | Remove export in next breaking hygiene pass **or** rename to `assertToolNameShape`; rely on banlist + catalogue allowlist. |
| KE-08 | **P3** | `packages/ui/src/components/nav-projects.tsx` | **shadcn demo chrome “Share Project” string in kit UI package** | L58–59 UI label “Share Project” (demo nav). Banlist does not match (not product compound). Axial structural also flags Acme sample sidebar. Not product domain, low false-signal risk for humans grepping “share”. | Leave or demote demo data to example-web design-system route; avoid product-sounding demo labels if banlist ever gains loose `share` word match. |
| KE-09 | **P3** | `AGENTS.md` § Product frame | **Product frame fence is clear but verbose — agent implementation risk** | Section *Product (résumé frame) — non-kit · ¬implementation order* with M0–M6 share rules lives in kit AGENTS. Fence text says do not implement in packages/examples. Machine gates hold domain out; process risk remains if agents treat AGENTS as backlog. | Keep fence. Prefer product frame only under `docs/product/*` in product repos long-term; kit AGENTS can keep a short pointer + banlist compounds. |
| KE-10 | — (healthy) | packages · apps/example-* | **0 product-share domain strings under banlist targets** | Wave 0 banlist OK. Manual scan: no `private_acl` / `private_key` / `SLUG_EXISTS` / `shlink` / `apps/share-` in packages or apps TS. Demo R2 prefix is `demo/` (`uploads` / notes tests). Error codes generic (`@kit/types`). Seed: “No product/share domain — examples only.” | Keep banlist green in `validate:full`. |
| KE-11 | — (healthy) | packages/* ↔ apps | **Every package used by an example (or tooling path)** | 14 packages: api-client→web; auth→api+web; comments/flows/tasks→api; core/db/email/storage/types→api; mcp→mcp-example; ui/i18n/types→web; config via `tsconfig.base.json` (extract asserts). Orphan check `EXTRACT_ORPHAN_FAIL=1` default. | When adding package, require example dogfood **before** merge (extract already fails orphans). |
| KE-12 | — (healthy) | apps/ | **No product apps in kit tree** | Only `example-api`, `example-web`, `mcp-example`. extract-dry-run notes kit-only tree. | Keep product apps out of kit HEAD; products pull upstream. |
| KE-13 | — (healthy) | consumer contract stack | **Zero-edit + deny-upstream + design overrides form a coherent consumer story** | Contract, zones JSON, exceptions example, dogfood harness, CI kit-baseline pattern, lefthook deny-upstream — aligned. Brand-agnostic kit vs product via `docs/product/kit-baseline`. | Protect `tools/` (KE-01); fill evidence (KE-02). |

---

## Metrics

| Metric | Value |
|--------|--------|
| Packages (`packages/*` with package.json) | **14** (config tooling exempt from orphan name check) |
| Example apps | **3** (`example-api`, `example-web`, `mcp-example`) |
| Product apps in tree (`apps/share-*` etc.) | **0** |
| Banlist patterns (hard compounds) | **7** + R2 `joinObjectKey('share'` check |
| Banlist product hits (packages + examples) | **0** (Wave 0 + this scan) |
| Orphan packages (no external importer) | **0** |
| Zero-edit protected_prefixes | 7 (`packages/`, examples×3, `scripts/`, `tooling/`, `config/`) — **`tools/` missing** |
| Zero-edit protected_files | 18 entries (root kit + subset of workflows) |
| Dogfood evidence fields filled | **0 / N** (template only) |
| Extract mode default | `kit` |
| CP-EXTRACT suite-after-drop | **Not implemented** (documented non-claim) |
| Issues | **P0=0 · P1=2 · P2=4 · P3=3** (+ 4 healthy non-findings) |

### Package → example importer matrix

| Package | External dogfood |
|---------|------------------|
| `@kit/api-client` | `apps/example-web` |
| `@kit/auth` | `example-api` + `example-web` |
| `@kit/comments` | `example-api` (routes/services/seed + dogfood lib) |
| `@kit/config` | tsconfig extends + vitest coverage helper (relative) |
| `@kit/core` | `example-api` |
| `@kit/db` | `example-api` |
| `@kit/email` | `example-api` |
| `@kit/flows` | `example-api` (`lib/flows-dogfood*`, modules) |
| `@kit/i18n` | `example-web` |
| `@kit/mcp` | `mcp-example` |
| `@kit/storage` | `example-api` |
| `@kit/tasks` | `example-api` |
| `@kit/types` | `example-api` + `example-web` |
| `@kit/ui` | `example-web` |

### Banlist vs product frame (coverage map)

| Product / ADR token | In banlist? | Present in packages/examples? |
|---------------------|-------------|-------------------------------|
| `share/{slug}` | yes | no |
| `share_publish` | yes | no |
| `private_key_product` | yes | no |
| `apps/share-` | yes | no |
| `shlink` / `s.example.com` / `share.example.com` | yes | no |
| R2 `joinObjectKey('share'` | yes | no (demo uses `demo/`) |
| `private_acl` | **no** | no |
| bare product `private_key` | **no** (only `_product` suffix) | no |
| `SLUG_EXISTS` | **no** | no |
| `share-mcp` | **no** | no |
| tasks visibility `shared` | n/a (kit domain) | yes — **not** product share |

### Zero-edit: scripts vs tools/

| Path | In zones? | Role |
|------|-----------|------|
| `scripts/` | **yes** (prefix) | banlist, extract, zero-edit, deny-upstream, debt, import-boundary runner |
| `tooling/` | **yes** | release-gifs pipeline |
| `tools/` | **no** | quality-gates, license, folder/file size, import-boundary exemptions |
| `config/` | **yes** | zero-edit zones SSoT, deploy example |

---

## Recommendations

1. **P1 — Close zero-edit hole:** add `tools/` to `config/zero-edit-zones.json` `protected_prefixes`; mention in `docs/product-consumer-contract.md` zones table.
2. **P1 — Honest dogfood claim:** fill `docs/product-consumer-dogfood-evidence.md` (product remote or dated self-sim log) **or** uncheck / reword AGENTS B5 permanent-greenfield line until evidence exists.
3. **P2 — Banlist harden:** add `private_acl`, `SLUG_EXISTS`, `share-mcp` (and decide bare `private_key` strategy without false-positives on comments).
4. **P2 — Zones ↔ contract parity:** protect root `tsconfig.json` (+ consider `README.md` and remaining kit workflows).
5. **P2 — Fix exceptions example:** `"version": 1` on `config/zero-edit-exceptions.example.json`.
6. **P2 — Extract lag:** add incubating packages to extract `required[]` + explicit `@kit/flows|tasks|comments|api-client` import probes in examples.
7. **P3 — Hygiene:** deprecate/remove misleading `assertNoShareTools`; demote UI “Share Project” demo if greppability becomes noisy.
8. **Keep green:** continue treating banlist + extract + zero-edit + deny-upstream as non-negotiable in `validate:full` (already wired in lefthook pre-push + CI).

---

## Claim validation (scorecard)

| Claim | Status | Notes |
|-------|--------|-------|
| 0 product/share domain strings in packages + example-* | **Met (machine + scan)** | Banlist green; frame tokens absent outside docs/AGENTS fence |
| Every package used by an example | **Met** | Orphan fail-on + matrix above |
| Zero-edit zones completeness (scripts vs tools/) | **Partial** | scripts/tooling protected; **tools/ gap (KE-01)**; some root/workflow files lag contract (KE-04) |
| Banlist coverage | **Partial** | Effective for current compounds; incomplete vs full product lexicon (KE-03) |
| Dogfood evidence docs | **Not met as claim** | Template empty vs AGENTS checked (KE-02); harness exists |
| Consumer contract alignment | **Mostly met** | Docs + gates coherent; zones lag contract on tools/tsconfig/workflows |
| Product domain fence AGENTS vs code reality | **Met in code** | Fence text + 0 share apps + demo-only domain; AGENTS product frame still long (process risk KE-09) |

**Overall extractibility health: strong machine bar, incomplete evidence/docs parity, one structural zero-edit gap (`tools/`).**
