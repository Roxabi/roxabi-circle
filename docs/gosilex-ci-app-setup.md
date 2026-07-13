# GitHub App `gosilex-ci` — setup (no PAT)

Same role as **roxabi-ci** on the Roxabi org: ephemeral tokens for **merge-on-green**, cascade `push` workflows, and merge of PRs that touch `.github/workflows/*`.

**No classic PAT.** Prefer this App org-wide for all `go-silex/*` private repos on Free plan.

> **Why this matters:** the `merge-on-green` workflow **always** tries to mint an App token.
> Until `GOSILEX_CI_APP_ID` + `GOSILEX_CI_APP_PRIVATE_KEY` exist (org vars/secrets), that job
> stays **red** on every PR — noise only; human merge + CI quality still work. Install the App
> below when you want label `reviewed` → auto merge-commit.

## 1. Create the App (UI — one-time)

1. Open (org owner) :  
   **https://github.com/organizations/go-silex/settings/apps/new**  
   (or *Settings → Developer settings → GitHub Apps → New GitHub App* under the org)

2. **Identity**

   | Field | Value |
   |---|---|
   | GitHub App name | `gosilex-ci` (must be unique on GitHub) |
   | Homepage URL | `https://github.com/go-silex` |
   | Callback URL | leave empty / n/a |
   | Webhook | **uncheck** Active (token mint only; no webhook needed) |

3. **Repository permissions** (minimum)

   | Permission | Access |
   |---|---|
   | **Metadata** | Read-only |
   | **Contents** | Read and write |
   | **Pull requests** | Read and write |
   | **Checks** | Read-only |
   | **Actions** | Read-only |
   | **Workflows** | Read and write |
   | **Issues** | Read and write (optional; close-linked-issues uses `GITHUB_TOKEN` today) |

4. **Where can this App be installed?**  
   → **Only on this account** (`go-silex`) — or any account if you prefer flexibility.

5. Create App → note **App ID** (numeric, top of app settings).

6. **Generate a private key** → download the `.pem` (store in Vaultwarden, never commit).

## 2. Install on the org

1. App settings → **Install App** → **go-silex**
2. **All repositories** (recommended for agency CI)  
   or only `silex-boilerplate` first, then product consumers

## 3. Store credentials (org-level preferred)

```bash
# App ID → org variable (non-secret)
gh variable set GOSILEX_CI_APP_ID --org go-silex --body '<APP_ID>' --visibility all

# Private key PEM → org secret
gh secret set GOSILEX_CI_APP_PRIVATE_KEY --org go-silex --visibility all < /path/to/gosilex-ci.pem
```

Repo-only alternative (if you prefer not org-wide):

```bash
# Kit repo
gh variable set GOSILEX_CI_APP_ID -R go-silex/silex-boilerplate --body '<APP_ID>'
gh secret set GOSILEX_CI_APP_PRIVATE_KEY -R go-silex/silex-boilerplate < /path/to/gosilex-ci.pem

# Product consumers (same pattern)
# gh variable set GOSILEX_CI_APP_ID -R go-silex/silex-share --body '<APP_ID>'
# gh secret set GOSILEX_CI_APP_PRIVATE_KEY -R go-silex/silex-share < /path/to/gosilex-ci.pem
```

Verify inheritance (org-level vars may not show on `gh variable list -R`):

```bash
gh api orgs/go-silex/actions/variables/GOSILEX_CI_APP_ID -q .name
gh api orgs/go-silex/actions/secrets/GOSILEX_CI_APP_PRIVATE_KEY -q .name
```

## 4. Workflow consumers

| Workflow | Usage |
|---|---|
| `silex-boilerplate` `.github/workflows/merge-on-green.yml` | mint token → merge when `reviewed` + checks green |
| Product repos (`silex-share`, …) | same mint step / org secrets (do not push to this kit as upstream) |

## 5. Smoke test

1. Open a tiny PR to `staging` (docs typo)
2. Wait for **Secret scan** green
3. `gh pr edit <n> -R go-silex/silex-boilerplate --add-label reviewed`
4. Expect **Merge on Green** to merge with a **merge commit**
5. Check run log: mint step succeeds; merge attributed to **`gosilex-ci[bot]`**

If mint fails with *private-key must be set*: secret not visible to the repo (install App + secret visibility).

## 6. Rotate key

1. App settings → Generate new private key  
2. `gh secret set GOSILEX_CI_APP_PRIVATE_KEY …` with new PEM  
3. Revoke old key in App settings  

## 7. Free plan notes

| Feature | Free private | App still useful? |
|---|---|---|
| Branch protection / rulesets | ❌ | Yes — merge-on-green enforces green + `reviewed` |
| Native auto-merge queue | ❌ | Yes — App merges directly |
| Ephemeral credentials | — | ✅ vs long-lived PAT |

## Refs

- Roxabi twin: `ROXABI_CI_APP_ID` / `ROXABI_CI_APP_PRIVATE_KEY` + forge `auto-merge.yml`  
- Action: `actions/create-github-app-token`  
- silex-share: `AGENTS.md` § GitHub Free  
