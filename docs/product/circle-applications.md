# `Roxabi/circle-applications`

https://github.com/Roxabi/circle-applications · local scaffold `circle-applications/`

## Experience

1. Human → agent: open an **empty** apply PR (empty commit, 0 files)  
2. **Title:** exactly `apply` (no login)  
3. **Body:**  
   - empty → simple candidature  
   - **or** exactly **one** line of the monorepo-hidden ASCII art → +10 bonus  
4. CI (`apply-check`) enforces title / 0 files / body shape / no PII  
5. **Merge every valid PR** (ticket = merged empty commit; identity = PR author)  
6. Scoring in monorepo uses GitHub user of the merged PR  

No application files. No personal data in the candidature repo.  
Scoring algorithm stays public in monorepo only — candidature repo stays thin.

## Optional +10 (monorepo only)

Documented **only** here:

`docs/product/.hidden/entry-bonus.md` + `docs/product/.hidden/seed.b85`

Reveal art (SEED + KEY consignes). Paste **one line only** into the apply PR body.

| | |
|---|---|
| Signal | `entryPrBonus: true` |
| Points | **+10** (cap 100) |
| Match | single-line PR body whose SHA-256 is in `ENTRY_BONUS_LINE_SHA256` |

Not advertised in `circle-applications` beyond a vague monorepo hint in `llm.txt`.

## What we do *not* store in circle-applications

- GitHub login in title/body  
- Essays, email, Discord  
- Full ASCII art blobs  
- Per-user markdown under `applications/`  

Identity = `pull_request.user.login` when scoring.
