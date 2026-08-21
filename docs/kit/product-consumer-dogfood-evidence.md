# Product consumer dogfood evidence

> **status: filled — 2026-08-13 · live product-mode on Roxabi/roxabi-circle**

Record live product-mode proof of zero-edit / deny-upstream for a greenfield consumer.

| Field | Value |
|-------|--------|
| Product repo | `Roxabi/roxabi-circle` · local `~/projects/roxabi/roxabi-circle` |
| Origin | `git@github.com:Roxabi/roxabi-circle.git` |
| Kit parent remote | `upstream` fetch `git@github.com:Roxabi/roxabi-boilerplate-cf.git` · **push `no_push`** |
| Kit parent SHA (dogfood time) | `628d942b856058e3cea10e789caa0e48fb670bcc` (`upstream/main` = kit HEAD) |
| Product inherit commit | `9755f90` (`chore(kit): merge upstream/main @ 628d942`) — on `origin/main` |
| `docs/product/kit-baseline` | `628d942b856058e3cea10e789caa0e48fb670bcc` |
| Date | 2026-08-13 |
| Operator | Mickael |
| Harness | `bash scripts/kit/dogfood-zero-edit.sh ~/projects/roxabi/roxabi-circle` → **exit 0** |
| Also | kit `bun run dogfood:zero-edit` (`--self-sim`) → exit 0 (same day) |

## Results (2026-08-13)

| Check | Result |
|-------|--------|
| `upstream` fetch URL | kit HEAD |
| `upstream` push URL | `no_push` |
| zero-edit product mode vs `upstream/main` | OK · `diverged_covered=0` |
| banlist | OK |
| deny-upstream (`name=upstream`) | blocked (exit 1) |
| deny-upstream (`name=origin`) | allowed (exit 0) |
| `bun run test:deny-upstream` (on product clone) | 7 pass / 0 fail |
| `@roxabi/circle-api` tests after inherit | 102 pass |
| product `validate:full` (circle pre-push) | green (push `6336e7f..9755f90`) |

**Not claimed:** platform JTBD D2/D3 / second compose. This file only prices the **consumer zero-edit contract**.

## Commands

```bash
# Self-sim product mode (from kit)
bun run dogfood:zero-edit

# Live product (this fill)
bash scripts/kit/dogfood-zero-edit.sh ~/projects/roxabi/roxabi-circle
```

Do not commit secrets.
