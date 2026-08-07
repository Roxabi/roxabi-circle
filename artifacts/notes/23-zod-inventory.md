# #23 Zod inventory (pre-bump)

Generated: 2026-08-07T10:41:30+02:00
npm latest zod: 4.4.3

## Workspace pins

| Workspace | package.json range |
|-----------|-------------------|
| packages/core/package.json | "^3.25.0" |
| packages/flows/package.json | "^3.25.0" |
| packages/mcp/package.json | "^3.25.0" |
| apps/example-api/package.json | "^3.25.0" |
| apps/example-web/package.json | "3.25.76" |
| apps/mcp-example/package.json | "^3.25.0" |

## Lock pre-state (zod@ lines sample)
```
1687:    "zod": ["zod@3.25.76", "", {}, "sha512-gzUt/qt81nXsFGKIFcC3YnfEAx5NkunCfnDlvuBSSFS02bcXu4Lmea0AFIUwbLWxWPx3d9p8S5QoaujKcNQxcQ=="],
1693:    "@better-auth/core/zod": ["zod@4.4.3", "", {}, "sha512-ytENFjIJFl2UwYglde2jchW2Hwm4GJFLDiSXWdTrJQBIN9Fcyp7n4DhxJEiWNAJMV1/BqWfW/kkg71UDcHJyTQ=="],
1707:    "@modelcontextprotocol/sdk/zod": ["zod@4.4.3", "", {}, "sha512-ytENFjIJFl2UwYglde2jchW2Hwm4GJFLDiSXWdTrJQBIN9Fcyp7n4DhxJEiWNAJMV1/BqWfW/kkg71UDcHJyTQ=="],
1737:    "better-auth/zod": ["zod@4.4.3", "", {}, "sha512-ytENFjIJFl2UwYglde2jchW2Hwm4GJFLDiSXWdTrJQBIN9Fcyp7n4DhxJEiWNAJMV1/BqWfW/kkg71UDcHJyTQ=="],
1761:    "fastmcp/zod": ["zod@4.4.3", "", {}, "sha512-ytENFjIJFl2UwYglde2jchW2Hwm4GJFLDiSXWdTrJQBIN9Fcyp7n4DhxJEiWNAJMV1/BqWfW/kkg71UDcHJyTQ=="],
```

## Import / schema touchpoints

- packages/core/src/parse.ts — ParseableSchema + flatten
- packages/flows/src/schema.ts, grant.ts, check.ts — z.record, .strict, safeParse
- packages/mcp/src/catalogue.ts — ZodTypeAny; schemas.ts
- apps/example-api — env.schema + routes safeParse
- apps/example-web — lib/schemas.ts
- apps/mcp-example — zod pin (tools use empty object schemas via catalogue)

## Nested peers already on 4.x
- better-auth / @better-auth/core, fastmcp, @modelcontextprotocol/sdk → zod@4.4.3

## Cross-track
- #29 OPEN, #30 OPEN — freeze/rebase if schema conflict
- #24 TypeScript 7 — OOS

## Post-bump

### Pins
packages/core/package.json:25:    "zod": "^4.4.3"
packages/flows/package.json:21:    "zod": "^4.4.3"
packages/mcp/package.json:21:    "zod": "^4.4.3"
apps/example-api/package.json:28:    "zod": "^4.4.3"
apps/example-web/package.json:33:    "zod": "^4.4.3"
apps/mcp-example/package.json:18:    "zod": "^4.4.3"

### D2
RESIDUAL zod@3:
    "shadcn/zod": ["zod@3.25.76", "", {}, "sha512-gzUt/qt81nXsFGKIFcC3YnfEAx5NkunCfnDlvuBSSFS02bcXu4Lmea0AFIUwbLWxWPx3d9p8S5QoaujKcNQxcQ=="],

zod lock lines:
    "zod": ["zod@4.4.3", "", {}, "sha512-ytENFjIJFl2UwYglde2jchW2Hwm4GJFLDiSXWdTrJQBIN9Fcyp7n4DhxJEiWNAJMV1/BqWfW/kkg71UDcHJyTQ=="],
    "shadcn/zod": ["zod@3.25.76", "", {}, "sha512-gzUt/qt81nXsFGKIFcC3YnfEAx5NkunCfnDlvuBSSFS02bcXu4Lmea0AFIUwbLWxWPx3d9p8S5QoaujKcNQxcQ=="],

## D2 allowlist (residual zod@3)

| Package | Why | Follow-up |
|---------|-----|-----------|
| shadcn@4.13.0 (`packages/ui` CLI) | CLI tool pins `zod: ^3.24.1`; nested lock key `shadcn/zod` → `zod@3.25.76`. Not a kit runtime dep path for core/flows/mcp/examples. | Optional: wait for shadcn CLI zod 4 peer; not blocking #23 |

Kit workspaces resolve **zod@4.4.3** (verified via require.resolve).

### Schema port notes
- `z.record(z.unknown())` → `z.record(z.string(), z.unknown())` in `packages/flows/src/schema.ts` (Zod 4 arity)
- `parseOrThrow` / flatten: no code change; existing core tests green on 4.4.3
- `ZodTypeAny` type-check still OK in mcp catalogue
- No example-api / example-web / mcp adapter code changes required

### PR body bullets
- Pin: `zod@^4.4.3` on 6 workspaces
- D2: only residual = shadcn CLI (allowlisted)
- No TypeScript 7 / no tsconfig target bump (#24 OOS)
- #29/#30: rebase if schema conflict; do not land dirty concurrent schema PRs without re-assert
- Dependabot zod bots: close/supersede — not ship unit
- Gates: typecheck, core/flows/mcp/example-api/auth tests, example-web typecheck, smoke:mcp, validate:full

### Tooling follow-fix (same PR)
- `@kit/flows` was still on `vitest@^3.2.0` while monorepo is vitest 4 — broke `test:coverage` (mixed coverage-v8 provider). Aligned to `^4.1.10` so validate:full passes. Residual from #28 landing before full vitest4 dogfood on flows.

## Review fixes (#41)

- `scripts/check-zod-major.sh` + `bun run zod-major` in `validate:full`
- `shadcn` moved to `@kit/ui` **devDependencies** (CLI only; `ui:add` already uses `bunx`)
- flows tests: dedicated describe + negatives for non-object args / invalid task id
