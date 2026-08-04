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
  - Events: `dependabot_alert` → `created` | `reopened` | `reintroduced`
  - Channel: `#int-bugs-alert` (`C0BDAPS2MG8`) — var `SLACK_CHANNEL_BUGS_ALERT`
  - Bot: **Flint** (BW `slack/flint`) — secret `SLACK_FLINT_BOT_TOKEN`
  - Smoke: Actions → “Dependabot alert → Slack” → Run workflow

> **Note:** `#int-bugs-alert` is wired to **Flint** (ops/bugs), same as health-check / silex-workers. There is no Rocky Slack bot token in the agent BW inventory for this channel.

## Secrets / vars (GitHub)

| Kind | Name | Source |
|---|---|---|
| Secret | `SLACK_FLINT_BOT_TOKEN` | BW `slack/flint` → `SLACK_BOT_TOKEN` / `SPARK_SLACK_BOT_TOKEN` |
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
