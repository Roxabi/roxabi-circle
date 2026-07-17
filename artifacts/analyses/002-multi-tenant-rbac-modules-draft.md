# Analyse #002 — Multi-tenant · RBAC · modules double niveau (draft pré-consensus)

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-07-16 |
| **Repo** | `go-silex/silex-boilerplate` |
| **Statut** | Draft — **supersédé pour décisions** par [`002-multi-tenant-rbac-modules-consensus.md`](./002-multi-tenant-rbac-modules-consensus.md) |
| **Succède** | Discussion session + analyse #001 cross-app + ADR-0002 (session BA) |
| **Cible** | ADR-0003 (après consensus) |

---

## 0. Intent

Kit Chemin A = **SSoT schéma** long terme pour SaaS multi-acteur Cloudflare (Workers/Hono/D1).

Spark / Metalyde / Ether = **inspiration uniquement** ; aucun n’est le schéma cible. Les apps B upgraderont vers ce modèle.

### Décisions déjà validées par product (session)

| # | Décision |
|---|---|
| 1 | **Tenant = toujours `organization`** (solo client = org 1 membre, transparente) |
| 2 | Rôles org système : **`owner \| admin \| member \| reader`** ; **à terme** rôles custom avec **Write / Read / disabled par module** |
| 3 | **Platform roles** : `super_admin \| staff` (distincts des rôles org) |
| 4 | **Modules double niveau** : platform `available` → org `enabled` (+ lock optionnel) |
| 5 | **BA vs tables kit pour orgs** : à clarifier (ce draft propose un split) |
| 6 | **SSoT schéma = ce kit** |

### Non-buts

- Billing multi-tenant Stripe
- Copier labels métier Metalyde (`LEAD`/`CONSULTANT`)
- Frame share (`private_acl`, recheck org GitHub) comme spine authz kit
- Deux modèles de données (solo vs multi-user)

---

## 1. Surfaces produit

```text
┌──────────────────────────────────────────────────────────────┐
│ PLATFORM (super_admin)                                       │
│  catalogue modules · config globale · toutes orgs            │
└────────────────────────────┬─────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────┐
│ BACK-OFFICE (staff + grants)                                 │
│  N clients · activer modules par org · gérer memberships     │
└────────────────────────────┬─────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────┐
│ ESPACE CLIENT (membership org kind=client)                   │
│  1 org forcée · données scopées · modules effectifs          │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Modèle conceptuel (mieux-disant)

### 2.1 Identity (Better Auth only — sessions)

- `user` / `session` / `account` / `verification` (BA)
- Providers : email/password · GitHub · Google · OIDC custom (P0 auth, autre issue)
- HMAC session : **deprecated / cutover** (hors scope de ce doc, lié BA-only)

### 2.2 Organization (tenant unique)

| Champ | Type | Notes |
|-------|------|--------|
| `id` | string PK | |
| `name` | string | |
| `slug` | string unique | URL / routing |
| `kind` | `client` \| `internal` | `internal` = ops Silex si besoin |
| `status` | `active` \| `suspended` \| `archived` | |
| `logo` / `metadata` | optional | |
| timestamps | | |

**Solo** : create org + membership `owner` en une transaction ; UI peut cacher l’org.

### 2.3 Membership

| Champ | Notes |
|-------|--------|
| `organization_id` + `user_id` | unique |
| `role_id` ou `role_key` | → rôle système ou custom (voir §3) |
| `status` | `active` \| `invited` \| `disabled` |

### 2.4 Platform role (sur user, hors org)

| Valeur | Pouvoir |
|--------|---------|
| `super_admin` | Catalogue modules platform, toutes orgs, config globale |
| `staff` | Back-office ; accès aux orgs via memberships / grants |
| `null` | User purement client (ou invited) |

Un staff qui suit 3 clients = 3 memberships (souvent `admin` côté org ou rôle staff dédié — **à trancher panel** : membership org vs table `org_grants` séparée).

**Proposition draft** : **un seul mécanisme** = `organization_members`. Staff a `platform_role=staff` **et** des memberships sur les orgs clientes. Pas de 2ᵉ système de grants. Super_admin peut bypass org membership pour admin platform (guard explicite).

---

## 3. Rôles — système maintenant, custom plus tard

### 3.1 Phase A (maintenant) — 4 rôles système figés

| `role_key` | Intent |
|------------|--------|
| `owner` | Contrôle total org (delete org, transfer ownership) |
| `admin` | Gestion membres + modules org + write métier |
| `member` | Write métier standard |
| `reader` | Read-only |

Mapping permissions **par défaut** (seed, pas UI) :

| Module capability | owner | admin | member | reader |
|-------------------|:-----:|:-----:|:------:|:------:|
| `read` | ✓ | ✓ | ✓ | ✓ |
| `write` | ✓ | ✓ | ✓ | ✗ |
| `manage_members` | ✓ | ✓ | ✗ | ✗ |
| `manage_modules` | ✓ | ✓ | ✗ | ✗ |
| `delete_org` | ✓ | ✗ | ✗ | ✗ |

### 3.2 Phase B (à terme) — rôles custom + matrice module

```text
organization_roles
  id, organization_id (NULL = platform template?),
  key, name, is_system, created_at

organization_role_module_grants
  role_id, module_id,
  access: 'write' | 'read' | 'disabled'
```

- Rôles système `is_system=true` : non supprimables ; grants seedés.
- Rôles custom : créés par `owner`/`admin` org ; grants **Write / Read / disabled** par module **available** pour l’org.
- `disabled` = module invisible / non utilisable pour ce rôle (même si org.module.enabled).

**Effective access** :

```text
module_visible(user, org, module) =
  platform.available
  AND org_module.enabled
  AND NOT org_module.locked?          -- option UX
  AND role_grant(module) ≠ disabled

module_can_write(...) =
  module_visible AND role_grant = write
```

### 3.3 Ce qu’on **ne** code pas en Phase A

- UI création rôles custom
- Table grants dynamique (sauf seed code des 4 rôles)

Mais le **schéma Phase A** doit **ne pas bloquer** Phase B (membership pointe vers `role_key` stable ou `role_id` nullable + key).

**Proposition membership Phase A** : stocker `role_key TEXT` (`owner|admin|member|reader`).  
Phase B : ajouter `role_id` nullable ; si set → custom ; sinon fallback `role_key` système.

---

## 4. Modules — double niveau (figé)

### 4.1 Définition (code registry)

```ts
// packages/* or app registry — not DB
MODULE_IDS = ['feedback', 'documents', ...] as const
// metadata: label, requiresGlobalConfig, defaultLocked?
```

### 4.2 Platform (super_admin)

```text
platform_modules
  module_id PK
  available INTEGER  -- exposé sur la plateforme ?
  config_json TEXT   -- secrets / URL globales (ex. Spark feedback)
  updated_at
```

### 4.3 Per organization (admin BO / owner org)

```text
organization_modules
  organization_id
  module_id
  enabled INTEGER
  locked INTEGER DEFAULT 0   -- visible grisé (inspiration Spark)
  config_json TEXT NULL     -- override local optionnel
  PRIMARY KEY (organization_id, module_id)
```

### 4.4 Qui fait quoi

| Acteur | Action |
|--------|--------|
| Super admin | `available` on/off + config globale |
| Admin BO / org admin | `enabled`/`locked` **si** `available` |
| Client end-user | consomme modules effectifs selon rôle |

### 4.5 Migration depuis kit actuel

`kit_modules (id, enabled, config_json)` → map vers `platform_modules` ; pas d’org layer aujourd’hui → seed `organization_modules` à la création d’org demo.

---

## 5. Point critique — Better Auth organization plugin vs tables kit

### 5.1 Ce que BA organization plugin apporte (v1.6+)

- Tables : `organization`, `member`, `invitation` (+ optional team)
- Rôles par défaut : **owner, admin, member** (pas `reader` out-of-the-box)
- **Access control** plugin : `createAccessControl` + `ac.newRole` — rôles **définis en code**, permissions par *resource statements*
- `additionalFields` sur org/member/invitation
- APIs : create org, invite, accept, set role, active org session

### 5.2 Ce que BA **ne** couvre pas nativement (besoin kit)

| Besoin kit | BA org plugin |
|------------|---------------|
| Platform roles super_admin/staff | Non (plutôt plugin **admin** BA séparé, ou colonne kit) |
| Modules double niveau platform→org | Non |
| Matrice role × module (read/write/disabled) dynamique en DB | AC BA = plutôt **static code** roles |
| `kind` client/internal, `status` org | Via `additionalFields` possible |
| Rôle `reader` | Custom role via AC |
| Guards IDOR + filter `organization_id` métier | App/kit services |

### 5.3 Options

| ω | Description | Pros | Cons |
|---|-------------|------|------|
| **ω1 — BA org plugin = socle tenant** | Org + member + invitation BA ; additionalFields ; AC pour 4 rôles système ; tables kit pour platform_modules + organization_modules + (plus tard) custom role grants | Aligné BA-only ; invites/API gratuits ; un seul id org | Couplage BA ; AC static ≠ Phase B custom DB roles ; dual mental model (BA member.role vs kit grants) |
| **ω2 — Tables kit only pour tenant** | `organizations` / `members` / `invitations` maison ; BA = identity only | Contrôle total Phase B ; pas de friction AC BA | Réimplémenter invites, active-org, edge cases ; plus de code |
| **ω3 — Hybride différé** | Phase A : tables kit minimales (org+member) sans invites BA ; Phase A+ : évaluer BA org si friction | Simple court terme | Risque migration si on bascule vers BA org plus tard |

### 5.4 Proposition draft (à valider panel)

**ω1 modifié (recommandé maintenant)** :

1. **Maintenant** : activer **BA `organization` plugin** pour `organization` + `member` + `invitation`.
2. `additionalFields` : `kind`, `status` sur organization.
3. Rôles système via AC BA : `owner`, `admin`, `member`, `reader` (code).
4. **Tables kit** (hors BA) :
   - `user_platform_role` ou colonne `platform_role` sur user (additionalField BA user **ou** table kit — préférer **additionalField user** si stable, sinon table kit)
   - `platform_modules`
   - `organization_modules`
5. **Phase B** : tables kit `organization_roles` + `organization_role_module_grants` ; membership BA `role` devient soit role_key système soit pointeur custom (documenter mapping). Si BA `member.role` string ne suffit pas → kit `membership_extensions(role_id)`.

**Pourquoi pas ω2 pur maintenant** : on bascule déjà tout sur BA pour sessions ; réinventer org/invite est du gaspillage si le plugin couvre 80 % du chemin happy.  
**Pourquoi pas BA AC seul pour modules** : les modules sont **data-driven** (available/enabled par tenant) — ça doit vivre en D1, pas dans un statement TS figé.

**Risque principal ω1** : Phase B custom roles divergents du modèle `member.role` string BA → mitigation : dès Phase A, documenter que `member.role` = **role_key** et que les grants fins sont kit-side lookup `role_key → default_grants` puis plus tard `role_id → grants`.

---

## 6. Guards (contrat API)

```text
requireSession()                    -- BA session
requirePlatformRole('super_admin')  -- platform ops
requireOrgContext(orgId|slug)       -- resolve membership OR super_admin bypass
requireOrgRole(...minRole)          -- owner > admin > member > reader
requireModule(org, module, 'read'|'write')
```

Toute query métier : **`WHERE organization_id = ?`** (fail closed). Tests IDOR obligatoires (seed multi-org).

---

## 7. Seed demo (acceptance kit)

| Persona | platform_role | memberships |
|---------|---------------|-------------|
| Super admin | super_admin | optional |
| Staff A | staff | org_acme admin, org_beta member |
| Client solo | null | org_solo owner (seul membre) |
| Client team owner | null | org_team owner |
| Client team reader | null | org_team reader |

Modules : `feedback` available platform ; enabled sur acme ; disabled sur beta.

---

## 8. Phasage implémentation (post-ADR)

| Phase | Scope |
|-------|--------|
| **A0** | BA-only session cutover (lié autre track) |
| **A1** | BA organization plugin + 4 rôles + additionalFields kind/status |
| **A2** | platform_role + platform_modules + organization_modules + migration kit_modules |
| **A3** | Guards + seed multi-persona + tests IDOR |
| **A4** | Shells demo `/admin` (BO) + `/app` (client) |
| **B** | Custom roles + matrice module read/write/disabled (DB) |

---

## 9. Questions ouvertes pour le panel

1. **ω1 vs ω2 vs ω3** pour org storage — confirmer ou amender §5.4  
2. **Staff access** : membership-only vs grants table séparée ?  
3. **`locked` sur organization_modules** : garder (Spark) ou YAGNI Phase A ?  
4. **`platform_role`** : additionalField BA user vs table kit ?  
5. **Active organization** : cookie/session BA active org vs header `X-Org-Id` explicite pour API ?  
6. **Super_admin bypass** : peut-il écrire dans toute org sans membership ? (support)  
7. Phase B custom roles : **par org only** ou templates platform réutilisables ?

---

## 10. Références

- `artifacts/analyses/001-cross-app-features-metalyde-ether-enzo-spark.md`
- ADR-0002 (session BA path)
- Better Auth organization plugin docs (roles, AC, additionalFields)
- Metalyde OVERVIEW/ARCHITECTURE (rôles 4 + client-team)
- Spark ARCHITECTURE (viewer + Section enabled/locked)
- Kit actuel : `kit_modules`, `KitRole = admin|user`

---

## 11. Critères de succès du consensus

Le panel doit produire un **ρ unique** sur :

1. Split BA vs kit tables (point 5)  
2. Staff model  
3. Schéma Phase A minimal (tables + champs)  
4. Extension path Phase B custom roles (sans rewrite)  
5. Modules 2 niveaux (confirm)  

Ensuite seulement : **ADR-0003**.
