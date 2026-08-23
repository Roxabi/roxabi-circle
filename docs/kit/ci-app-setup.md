# GitHub App `kit-ci` — setup (no PAT)

Same role as **kit-ci** on the operator org: ephemeral tokens for **merge-on-green**, cascade `push` workflows, and merge of PRs that touch `.github/workflows/*`.

**No classic PAT.** Prefer this App org-wide for all `your-org/*` private repos on Free plan.

> **Why this matters:** auto-merge (label `reviewed` + green checks → merge commit) needs this App.
>
> | State | How you know | Merge |
> |---|---|---|
> | **App not set** | Job green + **warning** `Manual merge required` + Job Summary « kit-ci: not configured » | **Human** (`gh pr merge --merge` or UI) |
> | **App set** | Mint step runs; merge attributed to `kit-ci[bot]` | Auto when `reviewed` + CI green |
>
> Gate flag = **non-secret** org/repo var `CI_APP_ID` (never check secrets in `if:`).
> Private key stays in secret `CI_APP_PRIVATE_KEY` and is only used when the var is set.

## 1. Create the App (UI — one-time)

1. Open (org owner) :  
   **https://github.com/organizations/your-org/settings/apps/new**  
   (or *Settings → Developer settings → GitHub Apps → New GitHub App* under the org)

2. **Identity**

   | Field | Value |
   |---|---|
   | GitHub App name | `kit-ci` (must be unique on GitHub) |
   | Homepage URL | `https://github.com/your-org` |
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
   | **Dependabot alerts** | **Read-only** (required for `dependabot-alert-slack.yml` poll — without it API returns `403 Resource not accessible by integration`) |

4. **Where can this App be installed?**  
   → **Only on this account** (`your-org`) — or any account if you prefer flexibility.

5. Create App → note **App ID** (numeric, top of app settings).

6. **Generate a private key** → download the `.pem` (store in Vaultwarden, never commit).

## 2. Install on the org

1. App settings → **Install App** → **your-org**
2. **All repositories** (recommended for agency CI)  
   or only `kit` first, then product consumers

## 3. Store credentials

### Free private org (your-org) — **repo-level is required**

On GitHub **Free** plans, **organization** Actions variables/secrets with visibility “all” often **do not reach private repositories**. Symptom: merge-on-green log shows `APP_ID:` empty + warning `Manual merge required`, even when org vars exist.

**Always set repo-level** on each private consumer (and on the kit if needed):

```bash
# PEM from Vaultwarden github/your-org/kit-ci → ~/.kit/secrets/kit-ci.private-key.pem
APP_ID=4297393   # kit-ci App ID
PEM=~/.kit/secrets/kit-ci.private-key.pem

gh variable set CI_APP_ID -R your-org/<repo> --body "$APP_ID"
gh secret set CI_APP_PRIVATE_KEY -R your-org/<repo> < "$PEM"
```

Optional org-level (nice for public repos / future Team plan; **not sufficient alone** on Free private):

```bash
gh variable set CI_APP_ID --org your-org --body '<APP_ID>' --visibility all
gh secret set CI_APP_PRIVATE_KEY --org your-org --visibility all < /path/to/kit-ci.pem
```

### Dual-branch products (`main` + `staging`)

Workflow **files** live on each branch. If you change secret **names** or mint steps:

1. Land the workflow change on **`staging`** and **`main`** (or promote staging→main).
2. `workflow_dispatch` / default-branch runs use the **default branch** workflow definition.
3. Deleting old secret names before **both** branches read the new names breaks auto-merge on the lagging branch.

### New product repo from this kit (checklist)

Full **zero-edit** contract: [`product-consumer-contract.md`](./product-consumer-contract.md).  
**Runbook:** [`playbooks/start-product.md`](./playbooks/start-product.md) — GitHub Fork is **DENY** (fork network, not polarity).

When spinning a product consumer (empty product repo + inherited **immediate parent** history + `upstream` fetch-only):

1. [ ] Create an **empty** GitHub private repo (under `your-org` **or** a foreign org — see below). Do **not** use the Fork button.
2. [ ] Clone the **immediate parent** (Roxabi → kit HEAD, go-silex → mirror), rename `origin` → `upstream`, add product `origin`, push `main` (**no kit file edits**):
   ```bash
   git remote rename origin upstream
   git remote add origin git@github.com:your-org/<product>.git
   git remote set-url --push upstream no_push
   git push -u origin main
   ```
3. [ ] Commit `config/product/inheritance.json` pinning that parent tip (see [`product-consumer-contract.md`](./product-consumer-contract.md) § Product file)
4. [ ] `bun install` (hooks via prepare if no `core.hooksPath`) · copy `.dev.vars.example` → gitignored local only
5. [ ] **CI App (mandatory on Free private):** set **repo-level** `CI_APP_ID` + `CI_APP_PRIVATE_KEY` (commands above) — **never** edit `merge-on-green.yml`
6. [ ] Confirm: draft PR → **Merge on Green** log has non-empty `APP_ID` and mint succeeds (or evaluate-only until set)
7. [ ] Product domain only under **new** `apps/<product>-*`; never patch `example-*` / `packages/*` for métier
8. [ ] When `apps/<product>-api` exists: `bash scripts/kit/kit-schema-sync.sh --app apps/<product>-api` (default `--modules core`; last-resort clones `--adopt` immediately)

Verify **repo** credentials (this is what Free private actually uses):

```bash
gh variable list -R your-org/<repo> | grep CI_APP
gh secret list -R your-org/<repo> | grep CI_APP
```

### First product on a foreign org

Secret/var **names are kit contract** — do not rename them to match the org brand.

| Step | Action |
|---|---|
| 1 | Create a GitHub App on **the foreign org** (same permissions as §1; App display name can be local, e.g. `acme-ci`) |
| 2 | Install the App on the product repo(s) |
| 3 | `gh variable set CI_APP_ID --org <foreign-org> --body '<APP_ID>' --visibility all` (or repo-level `-R`) |
| 4 | `gh secret set CI_APP_PRIVATE_KEY --org <foreign-org> --visibility all < /path/to/app.pem` (or repo-level) |
| 5 | Open a PR: until vars/secrets exist, merge-on-green is **evaluate-only** (green job + manual merge) — not a broken gate |
| 6 | When set: mint step runs; merge attributed to your App bot |

| Kit contract name | Kind |
|---|---|
| **`CI_APP_ID`** | variable (enable flag) |
| **`CI_APP_PRIVATE_KEY`** | secret (PEM) |

Do **not** use obsolete `Kit_CI_APP_*` names — workflows read **`CI_APP_*` only**.

## 4. Workflow consumers

| Workflow | Usage |
|---|---|
| `kit` `.github/workflows/merge-on-green.yml` | mint token → merge when `reviewed` + checks green |
| Product repos (`legacy-product`, …) | same mint step / org secrets (do not push to this kit as upstream) |

## 5. Smoke test

1. Kit HEAD: open a tiny PR to `main`. Product consumer: open it to `staging` (create that branch on the product; it does not exist on the kit).
2. Wait for **Secret scan** green
3. `gh pr edit <n> -R <this-repo> --add-label reviewed`
4. Expect **Merge on Green** to merge with a **merge commit**
5. Check run log: mint step succeeds; merge attributed to **`kit-ci[bot]`**

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
| Org Actions secrets → **private** repos | ❌ unreliable | Set **repo-level** `CI_APP_*` (see §3) |
| Ephemeral credentials | — | ✅ vs long-lived PAT |

## Refs

- operator twin: `KIT_CI_APP_ID` / `KIT_CI_APP_PRIVATE_KEY` + forge `auto-merge.yml`  
- Action: `actions/create-github-app-token`  
- legacy-product: `AGENTS.md` § GitHub Free  

## Related

- Environments (product git staging/main → Wrangler → CF; kit HEAD is `main` only): [`docs/kit/environments.md`](./environments.md)
- Cloudflare deploy (account-agnostic + local profile): [`docs/kit/deploy-cloudflare.md`](./deploy-cloudflare.md)
- Staging examples deploy: [`docs/kit/staging-examples.md`](./staging-examples.md)
- Product start playbook: [`docs/kit/playbooks/start-product.md`](./playbooks/start-product.md)
