# Appeal tickets

## Product rules

| Rule | Detail |
|---|---|
| Who | **Non-members only** (no `member` role) |
| Cap | **1 open ticket max** per Discord user |
| UI | `#appeal` panel (button) + slash `/appeal` |
| Storage | Private text channel `appeal-{discordUserId}` under **TICKETS** |
| Close | Ticket author → button **Fermer le ticket** (deletes channel) |

## Discord layout

| Channel / category | Access |
|---|---|
| `#appeal` | Visible to **@everyone** (visitors), **hidden** for `member`, no free chat (button only) |
| **TICKETS** | Hidden category; private ticket channels per user |
| Ticket channel | Ticket author + bot (Admin); staff with Admin see all |

## Worker

- `POST /interactions` handles `appeal:open` button + `/appeal` + `appeal:close:{userId}`
- Env: `DISCORD_APPEAL_CATEGORY_ID` (see `.dev.vars`)
- Gates: pure `decideTicketOpen()` — members blocked; existing `appeal-{id}` channel blocks

## Live IDs (2026-08-04)

| | |
|---|---|
| Appeal panel | `1534233768028799056` |
| TICKETS category | `1534245720821858467` |

## Prerequisite

Interactions Endpoint URL must point at a live Worker that verifies Ed25519 and returns within 3s — otherwise the button shows “interaction failed”.
