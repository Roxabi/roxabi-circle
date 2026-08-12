# Agent Prompts — Chemin A Quality Audit

Shared contract for every domain agent. Write findings to the path given in the spawn prompt.

## Universal rules

1. **Read-only on product logic** — do not change application code; only write under `artifacts/analyses/quality-audit/`.
2. **Evidence over vibes** — every finding needs file path + symbol/line hint + short why.
3. **No secrets** — never paste values from `.dev.vars` / env; flag presence only.
4. **Kit context** — this is a **multi-tenant capability kernel** kit (Workers · D1 · R2 · Hono · TanStack). Product domain must stay out of `packages/**`.
5. **Primary axis (ADR-0001):** apps compose `@kit/*` packages; do not reimplement platform concerns in apps.
6. **Severity:** P0 / P1 / P2 / P3 as in STRATEGY.md.
7. **If clean:** still write the file with Summary + empty Findings table + Metrics.

## Output format (mandatory)

```markdown
# {DOMAIN} — {PARTITION}

## Summary
2–5 sentences on health of this slice.

## Findings

| ID | Severity | File | Finding | Evidence | Recommendation |
|----|----------|------|---------|----------|----------------|
| F1 | P1 | path | short title | why / snippet ref | action |

## Metrics
- Files reviewed: N
- Issues: P0= · P1= · P2= · P3=
- Notable hotspots: …

## Recommendations
1. …
```

## Domain focus cheatsheets

### Axial Drift
- Packages importing apps
- App-local AppError / auth / storage forks
- Same helper copy-pasted across ≥2 `@kit/*` packages (N×M)
- Product markers in packages

### Architecture
- routes → services → repos discipline in example-api
- packages must not import apps
- circular workspace deps
- god modules at entrypoints

### Security
- requireAuth dual-path cookie | Bearer sk_
- org-scoped queries (IDOR)
- cookie flags HttpOnly/Secure/SameSite
- API key hash storage (no plaintext sk_)
- R2 key path traversal
- email open redirect / token TTL
- CSRF / Origin on mutations

### Code Smells
- files > ~400 LOC (quality-gates context)
- duplicated Zod schemas
- dead exports
- deep nesting in handlers

### Type Safety
- explicit `any` / `as any` / non-null asserts without guard
- Zod parse at boundaries missing
- incomplete Env types for Workers bindings

### Workers / Async
- floating promises in fetch handlers
- module-level mutable global state
- sync CPU-heavy work on request path
- missing `waitUntil` where needed
- Workflow/Queue patterns if present

### Error Handling
- throws not mapped to AppError
- empty catch / swallow
- stack or SQL leaked to client
- inconsistent error codes

### Test Quality
- auth/RBAC/IDOR coverage
- happy-path only services
- snapshot over-assert / under-assert
- missing negative tests on grants

### Tech Debt
- TODO/FIXME/HACK without issue
- biome-ignore without DEBT:slug
- deprecated APIs
- magic status codes / strings

### Kit Extractibility
- product/share strings in packages or example-*
- dual-edit zero-edit zone risk patterns
- packages never imported by examples
- CI gate gaps vs AGENTS validate:full
