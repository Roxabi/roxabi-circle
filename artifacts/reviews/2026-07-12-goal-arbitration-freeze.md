# Goal arbitration freeze — Chemin A boilerplate

| Field | Value |
|---|---|
| **Date** | 2026-07-12 |
| **Agents** | architect · devops · product-lead · axial-adr-review |
| **Purpose** | Make `/goal` deterministic — defaults locked; reopen only with explicit supersede |
| **Goal file** | `artifacts/goals/001-chemin-a-boilerplate-goal.md` |

---

## Consensus

1. **Boilerplate-first** is correct; share is P1 consumer.  
2. **Primary axis** = packages (platform) compose apps (deployables).  
3. **Hono Worker API** + Vite SPA + dual auth (cookie + sk_) + extract dry-run.  
4. **No empty packages** · **no share apps** until kit exit.  
5. **Ops Free** = gosilex-ci App + merge-on-green + process (no branch protection).  
6. **gosilex-ci** = ops track; prefer done, split from infinite-block code exit if App delayed.  

---

## A. Architecture decisions (locked)

| ID | Decision | Default | C |
|---|---|---|---|
| A1 | Package scope | `@gosilex/*` | 95 |
| A2 | Spine | Bun + Turbo + Biome + Vitest + Lefthook | 95 |
| A3 | API | Hono Worker only · 1 Worker per app | 98 |
| A4 | Web | Vite SPA (no Start as API) | 90 |
| A5 | Errors | `{ error: { code, message, details? }, requestId }` | 97 |
| A6 | Generic codes only in kit | UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR, CONFLICT, INTERNAL_ERROR, RATE_LIMITED | 98 |
| A7 | Layers | routes → services → repos | 92 |
| A8 | Package creation | only when example imports it | 96 |
| A9 | share apps | omit until goal exit | 95 |
| A10 | Demo D1 | `demo_notes` + `api_keys` (+ auth tables B3) | 94 |
| A11 | Demo R2 | prefix `demo/` only | 93 |
| A12 | Auth timing | key early; Better Auth B3; **both** for exit | 90 |
| A13 | Auth demo local | email/password or magic-link; GitHub optional | 82 |
| A14 | MCP | FastMCP · stdio · ping/whoami | 88 |
| A15 | Email | Mailpit + React Email B5 | 95 |
| A16 | i18n | FR+EN · Paraglide preferred | 80 |
| A17 | UI | shadcn Base UI | 88 |
| A18 | Extract | banlist + lint/typecheck/test without share | 91 |
| A19 | Out | billing, PostHog, flags, Datadog, Clerk, Next, Nest, shared team key | 97 |
| A20 | db schemas | **apps own schema**; `@gosilex/db` = client/migrate glue | 84 |
| A21 | Cookie local | same-host + Vite proxy | 86 |
| A22 | CORS | explicit origins + credentials | 94 |
| A23 | rate-limit/audit packages | stub or omit until 2nd consumer | 88 |
| A24 | TanStack Start | document non-default; do not scaffold | 96 |
| A25 | Presign | optional light helper; no video product | 83 |

### Tree (create order)

```text
B0: packages/{config,core,types} + apps/example-api (health)
B1: example-api + Zod + guards + CI
B2: packages/{db,storage} + D1/R2 demo
B3: packages/auth + cookies + sk_
B4: packages/ui (+ i18n) + apps/example-web
B5: packages/{mcp,email} + mcp-example + Mailpit
B6: extract scripts/CI + obs hooks + README kit
```

### Banlist (packages + examples)

Product compounds (not bare English “share”):  
`share/{slug}`, `private_key`, `private_acl`, `share_publish`, `share_list`, `share_delete`, `share_replace`, `shlink`, `s.gosilex.com`, hard-coded org gate product rules in packages.

---

## B. Axial decisions (locked)

| ID | Decision |
|---|---|
| X1 | **Primary axis:** platform packages compose deployable apps |
| X2 | **Test:** new product → `apps/<name>-*` only; no copy of auth/db/storage/error stacks |
| X3 | **Share later:** only `apps/share-{api,web,mcp}` |
| X4 | **N×M bans:** per-app AppError fork; domain in packages; MCP with full storage fork; empty package map; Next leakage |
| X5 | **Write** `docs/architecture/adr/*` with `axial: true` during goal (before multi-app scaffold deep) |
| X6 | **Three-strikes** → promote concern to package |

---

## C. Product / scope (locked)

| ID | Decision |
|---|---|
| P1 | Complete = **B0–B6** with demos D0–D11 (see goal file) |
| P2 | Auth: **session AND sk_** both required (not OR) |
| P3 | mcp-example + Mailpit **required** (not optional “selon plan”) |
| P4 | gosilex-ci smoke = **ops companion** track (prefer done; don’t block forever) |
| P5 | No live CF deploy required for kit exit |
| P6 | Example domain = **Notes/Files demo**, never artefacts |
| P7 | Fumadocs full site OUT · README+AGENTS enough |
| P8 | Playwright: 0 or 1 smoke B6, not full matrix |
| P9 | Reopen share only after code kit checkboxes green |

### Anti-goals (auto-reject)

Share M0 first · Nest parity · Clerk · shared team key · empty packages · product in packages · Start-as-backend · billing half-stubs · analytics FOMO · god example = share · branch protection as DoD · agent commit sans ask  

---

## D. DevOps (locked)

| ID | Decision |
|---|---|
| O1 | `main` + `staging` · PR → staging · merge commit |
| O2 | merge-on-green + **gosilex-ci App** · label `reviewed` |
| O3 | Fail-closed: require TruffleHog (+ CI job names when present) |
| O4 | Workflow quality name exact **`CI`** |
| O5 | Keep secret-scan **standalone** until CI lands; then both in `workflow_run` |
| O6 | Kit: local/CI green · CF staging optional B6 · **no share.* DNS** |
| O7 | Bindings naming `{app}-{env}` · example ≠ share resources |
| O8 | CF: Tool account · deploy token scoped later · global key never in GH |
| O9 | Mailpit local; staging email = log preferred |
| O10 | Obs: requestId logs P0 · Sentry/BS hooks B6 · not live SaaS for exit |
| O11 | Free: no force-push/protection — process only |
| O12 | Upgrade Team when team > ~3 committers / compliance |

### Ops pre-goal checklist

1. Create/install `gosilex-ci` + org secrets (runbook)  
2. Smoke merge bot  
3. Team: no direct push; `reviewed` human-only  
4. When monorepo CI: add `CI` + update merge-on-green  

---

## E. Failure modes if someone unfreezes carelessly

| Wrong move | Cost |
|---|---|
| Start as API | dual backends; MCP breaks contract |
| Empty package map | false complete |
| Share schema in `@gosilex/db` | extract forever polluted |
| Better Auth in B0 | blocked on OAuth secrets |
| Empty checks = merge | security process hole (mitigated in workflow) |
| `share/` R2 in demo | mental model + banlist fail |

---

## F. What `/goal` should NOT re-debate

Anything in sections A–D above unless explicit **Supersede** note with date + reason.

Still OK to refine during kit SPEC: exact Better Auth local provider, Paraglide vs JSON if Paraglide hurts Vite, FastMCP edge fallback to SDK (document ADR).

---

## G. Next steps after accept

```text
1. Accept this freeze (human)
2. /goal → track checkboxes + ops companion
3. Write axial ADR early
4. Kit SPEC (not share SPEC-001)
5. Plan + implement B0…
6. After exit → product SPEC from frame 001
```

---

## Agent confidence summary

| Agent | C | One-line |
|---|---|---|
| Architect | 86 | Hono monorepo + tree freeze; FastMCP medium |
| Devops | 90+ | Free+App correct; App install is P0 ops |
| Product | 88 | Binary DoD + demos; both auth surfaces |
| Axial | 90 | packages primary; ADR missing = blocking process |
