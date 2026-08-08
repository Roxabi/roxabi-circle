---
title: "chore(deps): wave 4 — fastmcp 4"
issue: 22
status: approved
tier: F-lite
date: 2026-08-07
---

## Problem

The kit dogfoods MCP via `apps/mcp-example` on **FastMCP 3.x** (`fastmcp: ^3.1.0` in lockfile / Dependabot baseline **3.35.0**). Upstream is on **4.x** (Dependabot PR #7 targets **4.12.2**). A major can change the `FastMCP` constructor, `addTool` shape, stdio start options, or Zod peer expectations — so a dedicated wave is required: bump + fix any adapter break so `smoke:mcp` and `@kit/mcp` tests stay green.

Why now: waves DX → lucide → vitest/vite (#19–#21) are closed. Wave 4 is the next open deps issue and blocks wave 5a Zod (#23). `@kit/mcp` deliberately has **no** `fastmcp` dependency (duck-typed `ToolServer`); only `mcp-example` imports the runtime — keep that boundary.

## Who

- **Primary:** Kit maintainers landing dependency waves on Chemin A
- **Secondary:** Product MCP apps that copy the example registration pattern (`createToolCatalogue` + `registerAll` → FastMCP)

## Constraints

- Bump `fastmcp` to latest stable **4.x** in `apps/mcp-example` (and lockfile); prefer aligning with Dependabot #7 target (~4.12.2) or newer patch
- Adapter API breaks only where required for compile/runtime (constructor, `addTool`, `start`/stdio)
- Keep `@kit/mcp` free of a hard `fastmcp` dependency unless a peer/docs force is documented
- Gates: `smoke:mcp` green · `@kit/mcp` + `mcp-example` tests green · typecheck on those packages
- Dedicated PR (DoD); may supersede/close Dependabot #7 after land
- Kit extractibility: no product domain strings; example tools stay `ping` / `whoami` only
- Do not group with monorepo Zod 4 (#23) unless a FastMCP 4 peer forces a documented, minimal peer pin

## Out of Scope

- Zod monorepo major (wave 5a / #23) except documented peer force
- TypeScript 7 (#24), other deps waves
- Product MCP tools / skill beyond kit example
- Switching MCP framework away from FastMCP (SDK-only rewrite)
- HTTP/streamable transport expansion (stdio smoke remains the gate)

## Premise Validity

**Success in 6 months:** Kit MCP dogfood runs FastMCP 4.x with green `smoke:mcp` and package tests; product consumers can copy the example without FastMCP 3 peer thrash.

**Failure in 6 months:** Still on FastMCP 3 after 6 months, or 4.x landed with red smoke/tests / broken catalogue registration so MCP example is unusable.

**Simplest alternative:** Merge Dependabot #7 as-is (version-only lockfile bump).
**Why not simplest:** Major 3→4 may break `FastMCP` / `addTool` / stdio start; a wave PR owns adapter fixes and proves smoke:mcp rather than a blind Dependabot merge.

## Complexity

**Tier: F-lite** — single domain (MCP dogfood + catalogue duck-type), clear DoD, possible small API adapter work; no multi-package architecture redesign.

Signals observed:

- Clear scope from issue body (fastmcp 4.x, adapter if needed, smoke + tests)
- Single surface: `apps/mcp-example` + possible touch of `@kit/mcp` ToolServer types
- Prior deps waves (#20, #21) same tier
- Contested with S only if pure version bump with zero API change — default F-lite for major + smoke gate
