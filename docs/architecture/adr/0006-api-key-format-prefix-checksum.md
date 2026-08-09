---
title: 'ADR-0006 — API key format: vendor prefix + offline checksum'
status: proposed
normative: false
date: 2026-08-09
supersedes_notes: >
  Proposal only. `normative: false` while `status: proposed` — a proposal is not law. Flip to
  `normative: true` when (and only when) the status becomes `accepted`, per the normativity axis
  (ADRs carry authority, working artifacts do not).
related:
  - docs/architecture/adr/0002-session-hmac-interim-vs-better-auth.md
  - docs/architecture/adr/0003-multi-tenant-rbac-modules.md
  - packages/auth/src/keys.ts
  - scripts/trufflehog-detectors.yaml
---

# ADR-0006 — API key format: vendor prefix + offline checksum

## Context

The kit mints machine credentials as `sk_` + 24 random bytes rendered as lowercase hex
(`packages/auth/src/keys.ts` — `generateApiKey`): 51 characters, 192 bits of entropy. The stored
lookup key is `apiKeyPrefix()` = `plaintext.slice(0, 12)`, i.e. `sk_` plus **9 hex characters**,
under a UNIQUE index (`api_keys_key_prefix_uq`, `schema.ts:16`).

The entropy is fine. Three other properties are not, and they were surfaced by shipping the secret
scanner in #51 rather than by design review.

### 1. `sk_` collides with Stripe — *known convention*

`sk_live_` / `sk_test_` are Stripe's well-known secret-key prefixes. Consequences, in both
directions:

- a custom detector for our keys cannot distinguish them from Stripe keys by prefix alone
- generic Stripe detectors may fire on ours, producing noise that trains people to ignore findings
- at a glance, in a log or a paste, one of our keys reads as a Stripe key

### 2. No checksum, so no third party and no tool can verify a key — *measured, #51*

This is the load-bearing problem. TruffleHog verifies a finding by calling the **issuer's** API. A
credential the kit mints itself has no such issuer, so its findings are structurally *unverified* —
and `--only-verified` discards them silently. Measured on trufflehog 3.96.0:

| Invocation | Result |
|---|---|
| `--only-verified` (the pre-#51 gate) | `unverified_secrets: 0` → exit 0, **a real key passes** |
| custom detector config, flag dropped | `unverified_secrets: 1` → exit 183 |

#51 works around this with a second, separately scoped invocation. That is correct but it is a
workaround: the scanner still cannot tell a genuine key from a 51-character lookalike. A
**checksum** removes the need for a workaround — any tool can validate a candidate **offline**,
with no network call and no issuer API. This is what the GitHub token format solved in 2021 with a
vendor prefix plus a checksum over the payload.

Related consequence already in the backlog: the exact-length regex the workaround needs has a
measured false negative on adjacent characters (#54) — `sk_<48hex>Z` and `sk_<49hex>` are both
missed. A checksum-validated pattern does not depend on a brittle length anchor.

### 3. The 12-character prefix caps the table at ~300k keys — *computed*

`key_prefix` is UNIQUE and carries only 9 random hex characters = **36 bits**. Birthday collision
reaches ~50% at roughly **310,000 rows** (`sqrt(2 · 2^36 · ln 2)`). A collision on a UNIQUE index
makes the **insert fail**, so the symptom is a mint that starts erroring, not a security breach.

Not urgent — the kit is pre-production and no product composes it yet — but the fix is free if the
format changes anyway, and expensive later since `key_prefix` is a UNIQUE index over stored data.

## Options considered

### Option A — Keep `sk_`, rely on the #51 detector

- **Pros:** zero work; already shipped; no migration.
- **Cons:** keeps all three defects. Detection stays prefix-and-length based, so it stays brittle
  (#54) and cannot distinguish a real key from a lookalike. Stripe ambiguity persists.

### Option B — Unique vendor prefix, no checksum

e.g. `rxk_` + 48 hex.

- **Pros:** removes the Stripe collision; a detector regex becomes unambiguous; small change.
- **Cons:** still unverifiable offline. The scanner still cannot separate a genuine key from any
  51-character string of the right shape, so the false-positive/false-negative trade remains a
  length-anchor problem.

### Option C — Unique vendor prefix + offline checksum *(recommended)*

e.g. `rxk_` + payload + short checksum over the payload.

- **Pros:** solves all three. Detection becomes **verify-by-computation**: near-zero false
  positives without relying on `\b` anchoring, and no dependence on an issuer API. Prefix
  disambiguates from Stripe. Prefix width can be re-chosen at the same time to fix the 36-bit
  ceiling.
- **Cons:** touches minting, prefix parsing, the stored `key_prefix` (UNIQUE index), the detector
  regex, and the docs. Needs a dual-accept window if any keys are in the wild.

### Option D — Option C plus a version segment

e.g. `rxk_v1_…`, so a future rotation is unambiguous.

- **Pros:** makes the next format change cheap; lets old and new coexist explicitly.
- **Cons:** longer keys; a second dimension to validate; over-engineering for a kit with zero
  format migrations behind it. **Recommend deferring** — Option C's prefix already carries enough
  signal to detect a v2 later.

## Decision (proposed)

**Option C.** Adopt a distinctive vendor prefix plus a checksum computed over the random payload,
so a key can be validated offline by any tool, including our own secret scanner.

Deliberately left open for the implementer (see *Open questions*): the exact prefix string, the
payload encoding, the checksum algorithm and width, and the resulting prefix width for the UNIQUE
column. This ADR fixes the **shape** of the decision, not its constants.

## Consequences

### Positive

- The secret scanner can validate rather than pattern-match: near-zero false positives, and no
  dependence on `--only-verified` semantics or a length anchor.
- No Stripe ambiguity in logs, pastes, or detector configs.
- The prefix-collision ceiling can be raised in the same change.
- Third-party scanners (GitHub secret scanning partner program, others) become possible later,
  because a checksum is what such programs require to accept a pattern.

### Negative / cost

- `packages/auth/src/keys.ts` — `generateApiKey` and `apiKeyPrefix` (the `startsWith('sk_')` check
  and `slice(0, 12)`).
- `apps/example-api` — `services/auth.ts:71` uses `apiKeyPrefix`; docs and seeds mention `sk_`.
- `scripts/trufflehog-detectors.yaml` — regex must change **in the same commit**; a stale pattern
  fails open, silently. This is already called out in that file's header.
- `docs/testing.md`, `AGENTS.md`, README and the auth matrix all reference `sk_`.
- Existing keys: a dual-accept window, or re-mint. See below.

### Migration

The cheapest possible moment is **now**: no product composes the kit
(`docs/architecture/platform-proof.md` marks every platform bar `Not met`), and the kit's own
database is demo data. Two viable paths:

1. **Clean break** — change the format, re-mint. Correct for the kit itself and for any
   pre-production deployment. Requires no dual-accept code.
2. **Dual-accept window** — accept both formats for one release, warn on the legacy shape, then
   remove. Necessary only if a real deployment holds keys that cannot be re-minted.

Recommend **1** unless an operator states otherwise. Note that #50 already made minting
fail-closed on the organization, so a re-mint is a well-defined operation rather than a guess.

Consistent with `docs/product-consumer-contract.md`: the kit does not mutate a consumer's
credential rows. A format change **informs**; the product re-mints on its own schedule.

## Open questions

1. **Prefix string.** Must be distinctive and greppable. Should it encode the product, or stay
   kit-wide?
2. **Checksum algorithm and width.** CRC32 rendered in the payload alphabet is the established
   choice; anything non-cryptographic is fine, since the checksum is an integrity/detection aid,
   not a security control. It must not be mistaken for one.
3. **Payload encoding.** Hex is simple and current; base62 is shorter for the same entropy. Hex
   keeps the detector regex trivial.
4. **Prefix width for the UNIQUE column** — pick from a target key count, not by inheritance. 36
   bits is the current, accidental value.
5. **Does the checksum belong in `@kit/auth` as a public helper**, so a product's own tooling can
   validate keys without reimplementing it?

## Non-goals

- Making the checksum a security boundary. It detects typos and enables offline detection; it does
  not authenticate. `verifyApiKey` + `timingSafeEqualHex` remain the only authentication path
  (ADR-0002 D6).
- Changing where the org binding is enforced — that is #53.
- Removing the #51 detector. It is needed for the current format regardless of this ADR's outcome,
  and it will still be needed afterwards for keys minted before the change.

## Ownership

Implementation lands in **`packages/auth`**, which is under concurrent modification by another
work stream; it should be assigned rather than picked up opportunistically. This ADR is a decision
proposal only — no code changes accompany it.

## References

- `packages/auth/src/keys.ts` — `generateApiKey` (L28-31), `apiKeyPrefix` (L35-39)
- `apps/example-api/src/db/schema.ts:16` — `key_prefix` UNIQUE
- `apps/example-api/migrations/0002_api_keys_prefix.sql` — `api_keys_key_prefix_uq`
- `scripts/trufflehog-detectors.yaml` — the current pattern and the `--only-verified` measurements
- #51 — the detector and full-history scan that surfaced the unverifiability
- #54 — the `\b` anchor false negative a checksum makes moot
- #53 — kit-level enforcement of ADR-0003 D11 (separate concern, same file)
- ADR-0002 D6 — constant-time comparison; unaffected by this proposal
