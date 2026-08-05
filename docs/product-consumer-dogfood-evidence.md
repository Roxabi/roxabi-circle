# Product consumer dogfood evidence

Record live product-mode proof of zero-edit / deny-upstream for a greenfield consumer.

| Field | Value |
|-------|--------|
| Product repo | (fill) |
| Kit parent remote | (fill — operator lineage) |
| Date | (fill) |
| Harness | `bun run dogfood:zero-edit` and/or real product clone |

## Commands

```bash
# Self-sim product mode (from kit)
bun run dogfood:zero-edit

# Real product (example)
bash scripts/dogfood-zero-edit.sh /path/to/product-clone
```

Attach CI green + zero-edit OK logs as needed. Do not commit secrets.
