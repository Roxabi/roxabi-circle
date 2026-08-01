# GitHub App `gosilex-ci` — setup (no PAT)

Same role as **roxabi-ci** on the Roxabi org: ephemeral tokens for **merge-on-green**, cascade `push` workflows, and merge of PRs that touch `.github/workflows/*`.

**No classic PAT.** Prefer this App org-wide for all `go-silex/*` private repos on Free plan.

> **Why this matters:** auto-merge (label `reviewed` + green checks → merge commit) needs this App.
>
> | State | How you know | Merge |
> |---|---|---|
> | **App not set** | Job green + **warning** `Manual merge required` + Job Summary « gosilex-ci: not configured » | **Human** (`gh pr merge --merge` or UI) |
> | **App set** | Mint step runs; merge attributed to `gosilex-ci[bot]` | Auto when `reviewed` + CI green |
>
> Gate flag = **non-secret** org/repo var `CI_APP_ID` (never check secrets in `if:`).
> Private key stays in secret `CI_APP_PRIVATE_KEY` and is only used when the var is set.

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
# App ID → org **variable** (non-secret) — this is the enable flag for merge-on-green
gh variable set CI_APP_ID --org go-silex --body '<APP_ID>' --visibility all

# Private key PEM → org **secret**
gh secret set CI_APP_PRIVATE_KEY --org go-silex --visibility all < /path/to/gosilex-ci.pem
```

Repo-only alternative (if you prefer not org-wide / product fork outside org inheritance):

```bash
# Kit or product repo
gh variable set CI_APP_ID -R go-silex/<repo> --body '<APP_ID>'
gh secret set CI_APP_PRIVATE_KEY -R go-silex/<repo> < /path/to/gosilex-ci.pem
```

### New product repo from this kit (checklist)

Full **zero-edit** contract: [`product-consumer-contract.md`](./product-consumer-contract.md).

When spinning a product consumer (fork / new repo + `upstream` → this kit):

1. [ ] Create GitHub private repo under `go-silex`
2. [ ] Clone kit as starting point; set remotes (**no kit file edits**):
   ```bash
   git remote add upstream git@github.com:go-silex/silex-boilerplate.git
   git remote set-url --push upstream no_push
   # deny-upstream is already in kit lefthook — do not copy a divergent hook
   ```
3. [ ] `bun install` · `bunx lefthook install` · copy `.dev.vars.example` → gitignored local only
4. [ ] **CI App:** inherit org-level `CI_APP_*` (preferred) **or** set repo-level var+secret — **never** edit `merge-on-green.yml`
5. [ ] Confirm: draft PR → **Merge on Green** Summary shows `gosilex-ci: configured` **or** `not configured`
6. [ ] Product domain only under **new** `apps/<product>-*`; never patch `example-*` / `packages/*` for métier

Verify inheritance (org-level vars may not show on `gh variable list -R`):

```bash
gh api orgs/go-silex/actions/variables/CI_APP_ID -q .name
gh api orgs/go-silex/actions/secrets/CI_APP_PRIVATE_KEY -q .name
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
2. `gh secret set CI_APP_PRIVATE_KEY …` with new PEM  
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

## Related

- Staging examples deploy: [`docs/staging-examples.md`](./staging-examples.md)
- Product start playbook: [`docs/playbooks/start-product.md`](./playbooks/start-product.md)
