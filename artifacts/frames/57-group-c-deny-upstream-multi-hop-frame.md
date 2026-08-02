---
title: "Group C — deny-upstream multi-hop + CP-DENY tests"
issue: 57
status: approved
tier: F-lite
date: 2026-08-02
parent: 54
---

## Problem

Product consumers that bounce through a private chassis (kit → chassis → product) can **accidentally push** to an intermediate parent: today’s `scripts/deny-upstream-push.sh` only blocks remote name `upstream` and URL substring `silex-boilerplate`. A chassis remote under another name (or a kit URL rename trick that already works only for the kit name) is **not** denied. The hook is also **untested** client-side UX — deleting or weakening it does not fail CI.

Group C (child of #54) extends deny-upstream for **multi-hop bounce safety** via kit defaults + product-owned config/env (zero-edit), adds **CP-DENY** automated proof, and documents bounce remotes + the client-side limitation.

## Who

- **Primary:** GOSILEX (or foreign-org) engineer on a multi-hop product clone who must not push kit **or** chassis without an explicit, documented escape
- **Secondary:** Reviewers / dogfood harness authors; kit maintainers who must keep chassis names **out** of hard-coded kit defaults

## Constraints

- **Do not** hardcode chassis names (e.g. `roxabi-cf-template`) forever in kit script defaults
- Kit default stays: remote name `upstream` + URL substring `silex-boilerplate`; kit origin (`origin` = boilerplate) remains a **no-op**
- Product extends denylist via **env** and/or **product-owned config** on allowed paths (`docs/product/…`, optional kit config defaults file) — **not** dual-edit of the script body per product
- Lefthook hook stays kit-shipped; products must not fork a divergent deny script
- Document bounce topology: `origin` = product, `upstream` = immediate parent only, `pushUrl=no_push`
- Honest docs: hook is **client-side UX**; real integrity = GitHub write ACLs; `LEFTHOOK=0` / `--no-verify` still bypass
- Zero product package names in kit scripts
- Axis-safe (ADR-0001): config/env extension, not N×M chassis hardcodes

## Out of Scope

- Installing foreign GitHub Apps
- Product CI templates (Group B — sibling, closed)
- Full playbook compose rewrite (Group A — sibling, closed) — only bounce remote section if not already done
- Server-side / GitHub ACL enforcement (document only)
- Changing lefthook architecture beyond wiring the existing deny hook

## Premise Validity

**Success in 6 months:** Bounce products cannot push kit or chassis by default — multi-hop clone: push to `upstream` / kit URL and configured chassis URLs fails; kit origin still no-ops; CP-DENY tests prove deny paths; escape is documented env/config only.

**Failure in 6 months:** Within 6 months of merge, a product can still push to a chassis remote under a non-`upstream` name (rename/chassis bypass), **or** CP-DENY is absent/red and the gap goes unnoticed — provable by one manual `git push` succeeding where it should deny.

**Simplest alternative:** Only document bounce remotes; no code change.
**Why not simplest:** Group A already improved narrative; rename/URL tricks still bypass name=`upstream`; untested hook remains client-side theater without CP-DENY.

## Complexity

**Tier: F-lite** — single domain (pre-push guard + config/env + harness + docs); clear acceptance from parent #54; no new packages or runtime auth.

Signals:

- Preferred files: `scripts/deny-upstream-push.sh`, optional `config/deny-upstream-remotes.json`, product path `docs/product/deny-upstream.json`, env `DENY_UPSTREAM_URL_SUBSTRINGS`, tests under `scripts/` or `tools/`, `docs/testing.md` (CP-DENY), playbook/contract bounce remotes
- Optional: dogfood smoke in `scripts/dogfood-zero-edit.sh`
- No multi-service architecture; table-driven harness is the main design choice
- Parent #54 already scoped work item 1 + design constraints
