# Plan 008 — MCP / agent contracts (kit surface)

> **Status:** TODO  
> **Date:** 2026-08-02  
> **Source:** quality discussion follow-up (ToolRegistrar, Zod publics, probes, SSOT wire agent)  
> **Epic:** Spark **#132** · GH **[#68](https://github.com/go-silex/silex-boilerplate/issues/68)** · p2 · todo · onRoadmap  
> **Orthogonal to:** [007](007-quality-gates-post-review.md) / B7 [#19](https://github.com/go-silex/silex-boilerplate/issues/19) (process · CI · obs)  
> **Related:** AGENTS §E MCP · CP-MCP in [`docs/testing.md`](../docs/testing.md) · ADR-0001 · A8 package rule · frame M5  
> **Baseline code:** `@gosilex/mcp` · `apps/mcp-example` · `smoke:mcp`  
> **Inspiration (not copy):** semctx ADR-0012 ToolRegistrar / public error catalogue · factory `roxabi-contracts` (wire SSoT multi-client)  
> **Siblings:** [007](007-quality-gates-post-review.md) · [009](009-layer-import-gate.md) · [010](010-quality-hygiene-debt.md)

**Executor rule:** do **not** invent a third MCP framework. Extend conventions **around** FastMCP / existing kit helpers. Product domain tools stay out of `packages/*` (banlist).  
**Port rule:** take *patterns* from semctx (registrar, budgets, public errors, honesty) — **not** MCP Apps, W3C baggage, dual plugin bundles, or Plane C READY.

---

## Issue mapping

| Slice | GH / Spark | State |
|---|---|---|
| Epic 008 (this plan) | **Spark #132** · **[GH #68](https://github.com/go-silex/silex-boilerplate/issues/68)** | OPEN · todo · p2 · onRoadmap |
| Child tickets | **None** | Optional slices S1–S4 |
| B7 #19 / Spark #120 | Unrelated | Do not implement 008 inside #19 |
| B6 #18 / Spark #119 | Unrelated | API client package ≠ agent wire (may **consume** shared Zod later) |

---

## Problem

Kit MCP today is **example-grade**:

| What exists | Gap |
|---|---|
| App-local `REGISTERED_TOOL_NAMES` + loop `addTool` | No reusable **ToolRegistrar** / catalogue type for product apps |
| `assertToolsMatchAllowlist` + unit tests | Boot assert only — not a typed registry (name → schema → handler meta) |
| `MCP_TOOL_NAMES` / `WhoamiResult.status` | Fragmented; no single **agent-wire SSOT** module |
| Zod on tools = empty `z.object({})` in example | No **public Zod** export shared API ↔ MCP ↔ skill for kit demo shapes |
| `smoke:mcp` stdio list+ping+whoami | Good **probe**, but not a reusable probe harness for N tools / error shapes |
| `@gosilex/types` = mostly `ErrorCode` + `ApiErrorBody` | AGENTS claims “Zod schemas”; product multi-client needs explicit public contracts |

Without this, product MCP forks copy paste registration, drift tool names vs allowlist, and invent ad-hoc status strings agents cannot rely on.

---

## Goals

1. **ToolRegistrar (catalogue)** — typed register of tools (name, description, input Zod, execute, optional authz tag) with allowlist assert at build/boot.
2. **Schemas Zod publics (kit demo only)** — export stable shapes that MCP + HTTP share for **kit** demo (`ping` result, `whoami` result, `/api/me` subject body) — **not** product domain.
3. **Contract probes** — extend CP-MCP: registry parity + stdio smoke + (optional) schema round-trip; document non-claims.
4. **SSOT wire agent** — one module of constants: env keys, header names, tool name list source, whoami status enum, error codes agent-safe.

**JTBD:**  
> Un product `apps/<x>-mcp` clone le pattern kit, enregistre N tools via registrar, share Zod avec l’API, et un probe CI échoue si tools/list ≠ catalogue.

---

## Non-goals

| Out | Why |
|---|---|
| Product tools (share publish, zip, …) | Product repos / banlist |
| New MCP server framework | FastMCP (or SDK) remains runtime |
| OAuth interactive MCP multi-tenant public | Later; frame uses `sk_` mint |
| HTTP streamable transport as required DoD | stdio first (already) |
| Putting registrar work into B7 / plan 007 | Orthogonal |
| Empty `@gosilex/agent` package zoo | A8 — grow `@gosilex/mcp` (+ types) only |
| Agent-facing string lint as security bar | Probes + SSOT > vanity lint |
| Replacing dual-auth Vitest with MCP probes | Auth SoT stays API tests |

---

## Current baseline (do not rewrite blindly)

```text
packages/mcp/
  assertToolsMatchAllowlist(names, allowlist)
  MCP_TOOL_NAMES = ['ping','whoami']     # example default
  extractBearerFromEnv
  handlePing / handleWhoami (+ SSRF host allowlist)

apps/mcp-example/
  REGISTERED_TOOL_NAMES                  # app SSoT
  for name of REGISTERED → FastMCP.addTool
  smoke: scripts/stdio-smoke.mjs         # in validate:full
```

Promote **pattern → package API**, keep app as composition.

---

## Design sketch (normative intent)

Inspired by **semctx ADR-0012** (ToolRegistrar, structured results, public error catalogue, input budgets) and **factory roxabi-contracts** (one schema SSoT for multi-client wire) — **adapted** to kit size (2 tools, FastMCP stdio, A8).

### 1. ToolRegistrar / catalogue

```ts
// packages/mcp — shape (illustrative)
type ToolEffect = 'read' | 'write' // descriptive only — NEVER authorization

type ToolDef<TIn extends z.ZodType, TOut extends z.ZodType = z.ZodType> = {
  name: string
  description: string
  input: TIn
  /** Optional but preferred for agent-stable outs */
  output?: TOut
  /** Descriptive hint for agents/docs — not a security boundary */
  effect?: ToolEffect
  /** Kit: ping none, whoami api_key — real auth still in handler / API */
  auth?: 'none' | 'api_key'
  // execute returns JSON-serializable; never logs secrets
  execute: (input: z.infer<TIn>, ctx: ToolContext) => Promise<z.infer<TOut> | unknown>
}

function createToolCatalogue<const T extends readonly ToolDef<z.ZodType>[]>(tools: T): {
  names: readonly string[]
  get(name: string): ToolDef<z.ZodType> | undefined
  assertExact(namesFromRuntime: string[]): void
  /** Materialize FastMCP registrations (only registration path) */
  registerAll(server: { addTool: ... }): void
}
```

| Rule | |
|---|---|
| App owns the **list** of product tools | Package owns **registrar mechanics** |
| Boot: `assertExact` vs runtime names | Same spirit as today |
| Banlist still forbids product lexicon in packages | Catalogue must not embed share domain |
| **Effect annotations** | `read`/`write` hints only — **≠** authz (semctx: effects never authorize) |
| **Handler never runs** before input gates pass | raw budget → Zod parse → execute |

#### 1b. Input budget (semctx-light, fail-closed)

Before Zod / handler (reject with public error `INVALID_ARGUMENTS`):

| Limit | Kit default (tunable constants in SSOT) |
|---|---|
| Max JSON depth | **32** (semctx uses 64 — kit demo can stay tighter) |
| Max visited values | **10_000** |
| Max array length | **1_000** |
| Max key length (UTF-16) | **256** |

No business handler if budget fails. Document constants in wire SSOT.

#### 1c. Output path (optional but AC for ping/whoami)

On success:

1. Handler returns canonical JSON-compatible value  
2. If `output` schema set → `safeParse` ; fail → public `INTERNAL_ERROR` (not raw exception)  
3. Tool text result = **deterministic** serialization of the same value (stable key order if object)  
4. Never put secrets, stack, repo paths, or raw Zod issue dumps in agent-facing text  

### 2. Schemas Zod publics

| Schema | Owner | Consumers |
|---|---|---|
| `pingResultSchema` | `@gosilex/mcp` | MCP tool out, tests |
| `whoamiResultSchema` | `@gosilex/mcp` | MCP + probes |
| `meResponseSchema` (subject, authMethod, requestId) | `@gosilex/mcp` first; promote to `@gosilex/types` only if API needs it without mcp dep | whoami fetch parse |
| Product schemas | **apps only** | never promote without 2nd product + ADR |

Prefer **parse on boundary** (`safeParse` / `parseOrThrow`) for whoami JSON today (cast-only).

### 2b. Public MCP / agent error catalogue (semctx-light)

Stable codes for tool failures (string union + fixed default message). **Do not** invent a parallel HTTP ErrorCode set — map when useful:

| Public tool code | Meaning | Maps to HTTP (optional) |
|---|---|---|
| `INVALID_ARGUMENTS` | budget or Zod input fail | `VALIDATION_ERROR` |
| `UNAUTHORIZED` | missing/bad sk_ when required | `UNAUTHORIZED` |
| `BAD_CONFIG` | missing API_BASE_URL / host deny | — |
| `UNREACHABLE` | network / non-2xx me | — |
| `INTERNAL_ERROR` | unexpected / output schema fail | `INTERNAL_ERROR` |

Rules:

- Agent-facing body: **exactly** `{ code, message }` (+ optional bounded `details` without secrets)  
- Message from catalogue (≤ ~200 chars), not `error.message` from exceptions  
- Internal diagnostics (log/requestId) stay server-side only  

### 3. Contract probes

| Probe | Already? | 008 action |
|---|---|---|
| Unit allowlist | yes | Keep; wire to catalogue.names |
| stdio `tools/list` exact set | yes (`smoke:mcp`) | Drive expected set from catalogue export |
| Call `ping` / `whoami` shapes | partial | Assert Zod public schemas on results |
| Negative: extra tool fails boot | partial | Catalogue assert + unit |
| Bearer missing / bad → whoami status | unit yes | Keep; map status enum SSOT |
| Budget reject oversized input | no | Unit: depth/array over limit → `INVALID_ARGUMENTS` |
| Output schema fail → public error | no | Unit with mock handler |

Document in testing.md:

| CP | Proves | Does not prove |
|---|---|---|
| CP-MCP-REG | tools/list == catalogue | tool business correctness |
| CP-MCP-SMOKE | stdio JSON-RPC path works | auth IDOR / org RBAC |
| CP-MCP-SCHEMA | out shapes stable + public error codes | FE cookie session |
| CP-MCP-BUDGET | oversized input rejected before handler | full DoS resistance under attack |

**Honesty (semctx vocabulary):** never claim “verified” for presence-only key checks; whoami `verified: true` only after `/api/me` subject parse OK (already true — keep explicit in docs).

### 4. SSOT wire agent

Single export surface (name bikeshed OK: `agentWire` / `mcpWire`):

| Constant | Example |
|---|---|
| Tool names source | catalogue / `MCP_EXAMPLE_TOOL_NAMES` |
| Env | `AUTHORIZATION`, `API_KEY`, `API_BASE_URL`, `MCP_ALLOWED_HOSTS` |
| Header | `Authorization: Bearer sk_…` |
| Whoami status enum | `ok \| missing_key \| unauthorized \| …` (already on type) |
| Public tool error codes | catalogue above |
| Input budget numbers | depth / values / array / key |
| Error codes HTTP agent-safe | reuse `ErrorCode` from `@gosilex/types` — no third set |
| JSON-RPC / content | no secrets in tool text results (existing whoami rule) |

### 5. Explicit non-ports from semctx ADR-0012

| Semctx | Kit 008 |
|---|---|
| MCP Apps + explorer resource | **Out** |
| W3C `traceparent` / `baggage` | **Out** (use requestId logs later via B7 Sentry) |
| Dual plugin byte-identical `plugin:check` | **Out** until multi-host skill packaging |
| Plane C READY / migration plan | **Out** |
| Zod 4 at MCP boundary only | Keep monorepo Zod 4 as today — one version |
| structuredContent + text dual | FastMCP text JSON is enough for kit; structuredContent only if FastMCP exposes easily without new framework |

---

## Sequencing

```text
S0  Spike / ADR-lite note (optional if API surface non-obvious)
S1  SSOT wire constants + whoamiResultSchema (parse in handleWhoami)
S2  ToolCatalogue/Registrar in @gosilex/mcp + migrate mcp-example
S3  Probes: smoke reads expected names from catalogue; schema asserts
S4  Docs: package README + testing.md CP-MCP-* + playbook one paragraph
S5  (optional) thin skill HTTP client note — only if still kit-relevant
```

**Depends on:** nothing from plan 007.  
**Prefer after:** smoke:mcp stable (already).  
**Parallel OK with:** B7 #19, B6 #18 (avoid same-files conflict on `packages/mcp` if B6 touches nothing MCP).

---

## PR slicing

| PR | Content | Size |
|---|---|---|
| **PR-008-1** | S1 schemas + SSOT constants + whoami parse | S |
| **PR-008-2** | S2 Registrar + mcp-example migrate | M |
| **PR-008-3** | S3 probes + testing.md CP rows | S |
| **PR-008-4** | S4 docs only | XS |

---

## Acceptance criteria

| # | Criterion |
|---|---|
| AC1 | `mcp-example` registers tools **only** via package catalogue helper (no ad-hoc `addTool` outside) |
| AC2 | `assertToolsMatchAllowlist` / catalogue assert fails if names drift |
| AC3 | Public Zod for ping/whoami (and me body used by whoami) exported and used in parse path |
| AC4 | `bun run smoke:mcp` still in `validate:full`; expected tool set from SSOT |
| AC5 | Unit tests: registrar drift, schema fail, **input budget**, public error shape (no secret leak) |
| AC6 | Zero product domain strings in `packages/mcp` / `packages/types` |
| AC7 | `bun run validate:full` green |
| AC8 | Docs: how a product app adds a tool in ≤15 lines pattern |
| AC9 | Effect annotations documented as non-authorizing |
| AC10 | testing.md CP-MCP-* rows with **Proves / Does not prove** |

---

## Verification

```bash
bun run --filter @gosilex/mcp test
bun run smoke:mcp
bun run validate:full
# manual: add fake tool name to allowlist only → boot or smoke fails
```

---

## Risks

| Risk | Mitigation |
|---|---|
| Over-abstract FastMCP | Thin adapter; `registerAll` optional |
| Promote product schemas early | A8 + banlist + review |
| SSOT vs app allowlist dual source | App list **is** the catalogue input; package has no product names |
| Scope creep skill/HTTP MCP | S5 optional; stdio first |

---

## Ownership

| Slice | Owner |
|---|---|
| Registrar + schemas | backend / mcp package |
| Probes | tester + devops (smoke in gate already) |
| Docs | maintainer |
| Product adoption | product repos (copy pattern) |

---

## Chain

| | |
|---|---|
| Predecessor | Informal agent-surface discussion; baseline MCP example |
| Sibling | Plan 007 (quality gates) — do not merge epics |
| Successor | Product MCP tools (M5 frame) on top of this pattern |
| Promote path | Optional ADR if registrar becomes multi-runtime (stdio + HTTP) |

---

## Open decisions (human)

1. ~~File epic~~ — **done** Spark #132 / GH #68.  
2. Schemas live in `@gosilex/mcp` vs `@gosilex/types`? **Default: mcp-owned** for tool I/O; types keeps ErrorCode/ApiErrorBody.  
3. FastMCP-only `registerAll` vs transport-agnostic catalogue first? **Default: catalogue + FastMCP adapter** in PR-008-2.  
4. Expose dual structuredContent? **Default: no** unless free with FastMCP.
