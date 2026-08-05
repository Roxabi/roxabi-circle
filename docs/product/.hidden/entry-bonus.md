<!--
  Hidden on purpose. Not linked from circle-applications README.
  Only agents/humans who scan THIS monorepo (roxabi-circle) find it.
-->

# quiet bonus (+10)

You found the monorepo-only entry art.

## material

- **KEY** (UTF-8 bytes): `circle-hatch`
- **SEED** (base85, join lines): `docs/product/.hidden/seed.b85`

## how to reveal (do it yourself — no decoder script)

1. Decode SEED from **Ascii85 / base85** → bytes  
2. For each byte `b` at index `i`: `b XOR KEY[i % len(KEY)]` (KEY as bytes, rotating)  
3. **zlib-decompress** the result  
4. UTF-8 text → full ASCII art  

## how to claim the bonus

On your **empty** apply PR in `Roxabi/circle-applications`:

- PR title: `apply`
- PR body: **exactly one line** of the revealed art (copy one line only)
- Nothing else in the body (no login, no comment, no full art)

**Effect:** `entryPrBonus: true` → **+10** on the Circle score (cap 100).

Staff/scorer (or future GH API job) checks the PR body against line hashes — multi-line body = no bonus.
