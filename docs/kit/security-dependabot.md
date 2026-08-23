# Dependabot — version updates vs CVE / security

## Two channels

| | Version updates | Security updates + alerts |
|---|---|---|
| Config | [`.github/dependabot.yml`](../../.github/dependabot.yml) | Repo **Dependabot alerts** + **Dependabot security updates** |
| Ecosystem | **`bun`** (text `bun.lock`) — not `npm` | Separate channel (CVE / GHSA) |
| Cadence | Weekly (Mon) + **cooldown** (patch/minor 3d, major 7d) | **Immediate** when a GHSA/CVE matches the lockfile |
| Cooldown | Yes (version only) | **No** — never delayed by `cooldown:` |
| Output | PR “stay current” | Alert in Security tab + optional security PR |

`package-ecosystem: npm` does not own `bun.lock`. Those PRs fail CI at `bun install --frozen-lockfile` before the suite runs.

### Ignored majors (version updates only)

Need a migration / decision, not a Dependabot bump. `ignore` does **not** apply to security updates.

| Package | Why |
|---|---|
| `@tanstack/react-table` (semver-major) | v9 rewrites the API (`useTable` + `tableFeatures`) |
| `@cloudflare/workers-types` (semver-major) | v5 drops dated entrypoints; prefer `wrangler types` locked to `compatibility_date` |

GitHub docs: `cooldown` applies **only** to version updates, not security updates.

## This repo

- Dependabot alerts: **enabled**
- Dependabot security updates (auto PR for fixed versions): **enabled**
- Slack: [`.github/workflows/dependabot-alert-slack.yml`](../../.github/workflows/dependabot-alert-slack.yml)
  - **Why not `on: dependabot_alert`?** That name is a GitHub *webhook* only — Actions rejects it (`Unexpected value 'dependabot_alert'`).
  - **Triggers used:**
    1. ~~`schedule` every 15 min~~ — **disabled 2026-08-06** (poll spam / missing Slack secret). Proper path later = GitHub App webhook `dependabot_alert` → Slack.
    2. `pull_request` opened by `dependabot[bot]` when body looks like a security update
    3. `workflow_dispatch` — smoke / full open-alert snapshot to Slack (`GET /dependabot/alerts?state=open`)
  - Channel: `#int-bugs-alert` (`C0BDAPS2MG8`) — var `SLACK_CHANNEL_BUGS_ALERT`
  - Bot: **Flint** (BW `slack/flint`) — secret `SLACK_FLINT_BOT_TOKEN`
  - Smoke: Actions → *Dependabot alert → Slack* → Run workflow

> **Note:** `#int-bugs-alert` is wired to **Flint** (ops/bugs), same as health-check / worker-fleet. There is no Rocky Slack bot token in the agent BW inventory for this channel.

Severity for Slack: prefer `security_advisory.severity` / `security_vulnerability.severity` (top-level `alert.severity` is often `null` on private repos).

## Secrets / vars (GitHub)

| Kind | Name | Source |
|---|---|---|
| Secret | `SLACK_FLINT_BOT_TOKEN` | BW `slack/flint` → `SLACK_BOT_TOKEN` / `SLACK_BOT_TOKEN_ALT` |
| Secret | `CI_APP_PRIVATE_KEY` (+ var `CI_APP_ID`) | **kit-ci** App — lists Dependabot alerts |
| Variable | `SLACK_CHANNEL_BUGS_ALERT` | `C0BDAPS2MG8` |

**kit-ci must grant** repository permission **Dependabot alerts → Read** (GitHub App settings → Permissions → save → re-approve install on `your-org`). Without it: `403 Resource not accessible by integration`. `GITHUB_TOKEN` alone is insufficient on this private repo.

Rotate Slack: update BW + `gh secret set SLACK_FLINT_BOT_TOKEN --repo kit-parent`.

## Manual checks

```bash
# Alerts API
gh api repos/kit-parent/dependabot/alerts --jq 'length'

# Enable (admin) if ever off
gh api -X PUT repos/kit-parent/vulnerability-alerts
gh api -X PUT repos/kit-parent/automated-security-fixes
```
