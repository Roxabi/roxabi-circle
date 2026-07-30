---
title: "Prompt — run /goal against Goal 002 (already written)"
date: 2026-07-30
goal: artifacts/goals/002-product-ready-multi-tenant-goal.md
---

# Prompt (copy-paste)

```text
/goal

Use existing SSoT (do NOT reinvent locked decisions):

**Primary goal file:** artifacts/goals/002-product-ready-multi-tenant-goal.md
status: ready-for-goal

## Your job
1. Read goal 002 fully (JTBD, supersede table, critical path, binary exit, security pins, **D13 /ship per epic**).
2. Confirm goal 001 is historical/superseded for live kit DoD.
3. Produce only:
   - any missing slice IDs / task breakdown under critical path waves
   - gap list vs current code (HMAC still present, etc.)
   - ordered handoff: **`/plan` → implement → `/ship`** per epic (never skip ship)
4. Do NOT expand scope to B6×4, B7 full, Start, Paraglide, share M0.
5. Do NOT re-open HMAC dual-path Option A.
6. Absorb security pins S1–S8 from goal 002 into plan ACs.
7. Encode in plan: **each epic lands with `/ship`** (PR + code-review + fix loop + `reviewed` + ci-watch).

## Epic map
See goal 002 § Epic map. Specs: 14-hmac-cut, 21-email, 15-B3, 13-B1, 17-B5, 22-rbac only.

## Next after this /goal pass
```text
/plan     — issue 14 (HMAC cut) only
# implement on feat branch until validate:full green
/ship     — PR + review + fix + reviewed + CI  (mandatory)
# then next epic: /plan #21 → implement → /ship  (etc.)
```
```
