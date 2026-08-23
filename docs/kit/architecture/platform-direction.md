# Direction plateforme — capability kernel multi-tenant

> **Autorité :** développement détaillé de la direction résumée dans
> [`AGENTS.md`](../../../AGENTS.md). La mission kit-only, la règle de précédence et les
> sept invariants de la constitution gagnent en cas de conflit. Ce document n'est pas un backlog.

### Direction — multi-tenant capability kernel

| Récit | Langage | Portée |
|---|---|---|
| **Kit (normatif)** | *Multi-tenant capability kernel* — packages products compose | Ce monorepo · agents lisent ceci |
| **Product / dogfood (alias)** | *Company OS+++* | Stretch interne · narrative **product-facing** only — **pas** le titre d’ambition kit |

**Ambition kit :** un kernel multi-tenant en **trois piles phasées**, composé dans **N product deploys** (pas un process OS global) :

| Pile | Kit (`@kit/*`) | App (example / product) | Promote gate |
|---|---|---|---|
| **SaaS** | auth, core, db, ui, storage, email, i18n, types | `MODULE_IDS`, routes, seed, domain | [ADR-0001](../architecture/adr/0001-primary-axis-packages-compose-apps.md) + [ADR-0003](../architecture/adr/0003-multi-tenant-rbac-modules.md) |
| **Workflow** | `@kit/flows` (+ later `flows-ui`) | plans YAML, tools, Workflows bind, D1 wire | [ADR-0005](../architecture/adr/0005-flows-platform-agentic-workflows.md) **D6** |
| **Agents** | `@kit/mcp` conventions ; shared tool registry / agent loop **only if ≥2 call sites** | product tools, MCP server ; code-mode **product-opt-in only** | **same D6 class · after flows runner proven** — no `@kit/agents` before evidence |

```text
Phase (normative order — not aspiration):
  1. SaaS kernel     (now)
  2. Workflows       (P0 incubating — [ADR-0005](../architecture/adr/0005-flows-platform-agentic-workflows.md) children)
  3. Agents org-aware (after durable create-run + meter + dogfood)
     code-mode = product footnote only · never kit default
```

#### Isolation

| Niveau | Unit | Scope |
|---|---|---|
| **Deploy** | Product Worker (DB · bindings · secrets) | Un product = un espace d’orgs |
| **Tenant** | `organization` ([ADR-0003](../architecture/adr/0003-multi-tenant-rbac-modules.md)) | Solo = org 1 member |
| **Actor / audit** | user · agent · run | Nested **under** org grants |
| **Time** | run **snapshot** immutable | TOCTOU fail-closed |

- **Pas** gadget-per-user.  
- **Pas** company-wide identity fabric cross-products — même entité légale sur 2 products = **concern product/SSO**, hors garantie kit.  
- Org isole data & grants ; user/agent/run isolent acteur & audit ; snapshot isole le temps. **Aucun privilège de « je suis un agent ».**

#### Dogfood (3 modes — mutuellement exclusifs)

| Mode | Means | Acceptance | = « premier tenant » ? |
|---|---|---|---|
| **example-\*** | Multi-persona seed orgs dans le kit | IDOR matrix green · 0 product string | **Non** (synthétique) |
| **zero-edit product** | Product repo pull upstream, no kit edit | `zero-edit` + deny-upstream green | **Non** (contrat consumer) |
| **internal product** | Real product deploy ; Roxabi/Silex comme org (`kind=internal`) | Hors monorepo kit · plans/tools réels | **Oui** — seul mode qui prouve JTBD platform |

#### JTBD

**JTBD-dev (P0 — machine-priced) :**  
> *En partant de ce monorepo, un dev clone le kit CF, a `example-api` + `example-web` + `mcp-example` verts (lint/typecheck/test), auth demo, UI shadcn, erreurs centralisées, i18n FR/EN, email catcher local — sans aucune string métier produit.*

**JTBD-platform (direction — falsifiable) :**  
> *Un product compose le kernel multi-tenant ; une org y exécute au moins un plan gouverné (grant∩permits · snapshot · admin gate) ; un second product compose sans forker le runner.*

**SSoT preuve platform :** [`docs/kit/architecture/platform-proof.md`](../architecture/platform-proof.md) (bars D1–D3 · second compose · tenant nommé · status met/not).  
**Non-claim :** multi-tenant Phase A + pure `@kit/flows` + MCP example **≠** platform JTBD met · **≠** « Company OS » shippé.

**Gouvernance =** grants mint server-side · `check` before first token · snapshot immuable · side effects HITL principal-bound · budgets metered · promote package only with dogfood + second call site ([ADR-0005](../architecture/adr/0005-flows-platform-agentic-workflows.md) D4/D6).
#### Invariants (direction — reviewable)

1. **Grants = sole max power** — plan/MCP permits may only **narrow** ; never expand.  
2. **Runner executes snapshot only** — live plan edits do not re-arm in-flight runs.  
3. **Grant provenance** — apps mint from server session / org module policy ; **never** from plan body, client, or agent self-description.  
4. **Default-deny ambient authority** — empty/absent permits + effectful tools = fail-closed.  
5. **Isolation fields mandatory** — every plan/run/agent tool call is org-scoped ; no cross-org ambient registry.  
6. **Product domain never under** `packages/**` · durable work on **CF Workflows** not ad-hoc DO engine.  
7. **Agents tools = registry ∩ grants** (parity MCP ↔ flows when both present) ; dual-auth session \| `sk_` **org-bound**.

#### Steal-list (patterns rebind multi-tenant — not feature crib)

| Steal (pattern) | Multi-tenant rebind (kit) |
|---|---|
| default-deny | org grants ∩ plan/MCP permits ∩ registry ; empty = fail-closed |
| HITL async | principal-bound approve (session / `sk_` + org admin V0) ; **never** raw unauthenticated Workflow continue |
| AI Gateway budgets | runtime meter + hard abort ; static ceilings necessary ≠ sufficient |
| capability connectors | tools only when kit wrappers enforce ; no `net` / `r2` advertised until then |

**≠ Cloudflare OS :** productivity OS *interne* / fork-per-company / gadgets sandboxed. **On n’embarque pas** CF OS dans le kit ([ADR-0005](../architecture/adr/0005-flows-platform-agentic-workflows.md) OOS). Deploy interne optionnel **hors** monorepo kit.

**Anti-isomorphism test :** si un changement fait du kit un **host productivity OS** (gadget shell, per-file apps, ambient code-load default) plutôt que des packages products compose → **out of scope**. Non-goals bloquent la *forme*, pas seulement le nom.

#### Non-goals & kit-defaults banlist

| Non-goal shape | Kit-defaults banlist (security) |
|---|---|
| Clone gadget OS · « chaque fichier = app » | Broad connector allowlists / ambient tool registries in `example-*` |
| End-user coding agent day-1 | `permits.net` / `r2` fields before enforcement wrappers |
| Product domain dans `packages/*` | Shell / `exec` / free-form code-mode in kit packages |
| Second monorepo company-context dans le kit | Product domain plans or agent prompts in `packages/*` |
| Employee productivity OS in kit | HITL as unauthenticated Workflow event from the internet |
| | API keys with create-run + high-permit tools without scoped mint |

#### Value demos (sequence — not pillars)

| Demo | Who | Bar |
|---|---|---|
| **D1** | Dev kit consumer | Clone → green `example-*` |
| **D2** | Product eng / tenant | Invite → org shell → module enable |
| **D3** | Org admin | Publish plan → run → HITL/receipt |
| **Agents** | After D3 + second call site | MCP/tools under same grant∩ path |

#### Priorité (normative)

| Priorité | Livrable | Intention |
|---|---|---|
| **P0** | **Kit Chemin A** | `packages/*` + `apps/example-*` verts · 0 string métier · bar machine — **gagne toujours** vs platform growth |
| **P0 incubating** | **Flows** | `@kit/flows` + [ADR-0005](../architecture/adr/0005-flows-platform-agentic-workflows.md) children (#29–#31…) — promote D6 only |
| **P0 incubating** | **Tasks + comments** | `@kit/tasks` + `@kit/comments` ([ADR-0007](../architecture/adr/0007-tasks-comments-kernel.md)) — pure shipped; example dogfood next · promote after first product compose |
| **After flows evidence** | **Agents org-aware** | Same grant∩ + registryVersion as flows · no new agent package without second call site |
| **Hors scope** | Apps métier (`apps/share-*`, etc.) | Repos product |
| **Hors scope** | Cloudflare OS as kit · code-mode kit default | Product opt-in or external deploy |

**P2 later (not day-1) :** shared tool-registry SSOT types MCP∩flows when second consumer needs it · module catalogue ids `flows` / later `agents` under [ADR-0003](../architecture/adr/0003-multi-tenant-rbac-modules.md) · optional **future agents ADR** only when agent loop / code-mode becomes real scope with evidence.

## Chemin A et Chemin B

| Chemin | Plateforme | Boilerplate |
|---|---|---|
| **A** (ce repo) | Workers · D1 · R2 · secrets/WAF Cloudflare | Workers-first + SPA React |
| **B** | Next + Neon/Supabase · Resend · Upstash | `chemin-b-boilerplate` |

CD Chemin A : pull après CI verte; la CI reste bloquante avant merge/deploy.

## Related authority

- [Platform proof](./platform-proof.md) — preuve falsifiable du JTBD plateforme.
- [Product consumer contract](../product-consumer-contract.md) — zero-edit et héritage downstream.
- [Stack standard](../standards/stack.md) — choix techniques A–L et rationale.
