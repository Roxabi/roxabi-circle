# Dependabot — version updates vs CVE / security

## Two channels

| | Version updates | Security updates + alerts |
|---|---|---|
| Config | [`.github/dependabot.yml`](../.github/dependabot.yml) | Repo **Dependabot alerts** + **Dependabot security updates** |
| Cadence | Weekly (Mon) + **cooldown** (patch/minor 3d, major 7d) | **Immediate** when a GHSA/CVE matches the lockfile |
| Cooldown | Yes (version only) | **No** — never delayed by `cooldown:` |
| Output | PR “stay current” | Alert in Security tab + optional security PR |

GitHub docs: `cooldown` applies **only** to version updates, not security updates.

## This repo

- Dependabot alerts: **enabled**
- Dependabot security updates (auto PR for fixed versions): **enabled**
- Slack: [`.github/workflows/dependabot-alert-slack.yml`](../.github/workflows/dependabot-alert-slack.yml)
  - **Why not `on: dependabot_alert`?** That name is a GitHub *webhook* only — Actions rejects it (`Unexpected value 'dependabot_alert'`).
  - **Triggers used:**
    1. `schedule` every 15 min — REST `GET /dependabot/alerts?state=open`, post alerts created in the last ~20 min
    2. `pull_request` opened by `dependabot[bot]` when body looks like a security update
    3. `workflow_dispatch` — smoke / full open-alert snapshot to Slack
  - Channel: `#int-bugs-alert` (`C0BDAPS2MG8`) — var `SLACK_CHANNEL_BUGS_ALERT`
  - Bot: **Flint** (BW `slack/flint`) — secret `SLACK_FLINT_BOT_TOKEN`
  - Smoke: Actions → *Dependabot alert → Slack* → Run workflow

> **Note:** `#int-bugs-alert` is wired to **Flint** (ops/bugs), same as health-check / silex-workers. There is no Rocky Slack bot token in the agent BW inventory for this channel.

Severity for Slack: prefer `security_advisory.severity` / `security_vulnerability.severity` (top-level `alert.severity` is often `null` on private repos).

## Secrets / vars (GitHub)

| Kind | Name | Source |
|---|---|---|
| Secret | `SLACK_FLINT_BOT_TOKEN` | BW `slack/flint` → `SLACK_BOT_TOKEN` / `SPARK_SLACK_BOT_TOKEN` |
| Secret | `CI_APP_PRIVATE_KEY` (+ var `CI_APP_ID`) | **gosilex-ci** App — used to list Dependabot alerts (`GITHUB_TOKEN` often 403 on private) |
| Variable | `SLACK_CHANNEL_BUGS_ALERT` | `C0BDAPS2MG8` |

Rotate: update BW + `gh secret set SLACK_FLINT_BOT_TOKEN --repo go-silex/silex-boilerplate`.

## Manual checks

```bash
# Alerts API
gh api repos/go-silex/silex-boilerplate/dependabot/alerts --jq 'length'

# Enable (admin) if ever off
gh api -X PUT repos/go-silex/silex-boilerplate/vulnerability-alerts
gh api -X PUT repos/go-silex/silex-boilerplate/automated-security-fixes
```
