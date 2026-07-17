# Analyse #002 — Multi-tenant · RBAC · modules — Expert Consensus

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-07-16 |
| **Issue** | null (pré-issue ; track kit, pas silex-share#12) |
| **Status** | `consensus-reached` |
| **Confidence** | **high** (≈85–90 % shape ; residual = SQL exact BA org 1.6 + mutability additionalFields) |
| **Panel** | architect · security-auditor · backend-dev |
| **Input** | [`002-multi-tenant-rbac-modules-draft.md`](./002-multi-tenant-rbac-modules-draft.md) |
| **Next** | **ADR-0003 accepted** (`docs/architecture/adr/0003-multi-tenant-rbac-modules.md`) · issues Phase A remaining |

---

## Problem

Définir le **schéma long terme** du kit Chemin A pour :

- multi-tenant (`organization` toujours, solo = org transparente)
- RBAC back-office vs espace client
- modules **double niveau** (platform available → org enabled)
- extension future : rôles custom + Write/Read/disabled **par module**
- split **Better Auth vs tables kit** (point 5)

Sans écrire l’ADR tant que le panel + l’humain n’ont pas verrouillé ρ.

---

## Panel

| α | Focus |
|---|--------|
| **architect** | Spine BA vs kit, axial packages, Phase A→B sans rewrite |
| **security-auditor** | IDOR, escalade, invites, keys, super_admin, fail-closed |
| **backend-dev** | Workers/D1, migrations, BA 1.6, seed, livrables shippable |

---

## Consensus ρ

### Décisions unanimes (3/3)

| # | ρ |
|---|---|
| **1 · Tenant storage** | **ω1 modified** — BA **organization** plugin = spine (`organization` + `member` + `invitation`). **Rejet** ω2 (kit-only) et ω3 (kit puis BA). |
| **2 · Modules** | **Kit D1 only** : `platform_modules` + `organization_modules`. BA AC **ne** pilote **pas** available/enabled. |
| **3 · Rôles org Phase A** | 4 system keys sur `member.role` : **`owner \| admin \| member \| reader`**. Matrice capabilities = **code seed**, pas tables. |
| **4 · Staff** | **`platform_role=staff` + memberships réelles**. **Pas** de table `org_grants`. Staff ≠ bypass data-plane. |
| **5 · Platform plane** | `super_admin \| staff \| null` distinct des rôles org. Org admin **ne peut pas** muter platform_role / platform.available. |
| **6 · Phase B** | Custom roles **per-org only** d’abord ; `organization_roles` + grants module `write\|read\|disabled` ; `member.role` reste role_key système ou convention documentée ; templates platform = copy-on-create plus tard. |
| **7 · Org context API** | **Hybride** : BA active org = UX SPA ; **authz = org id explicite** (path préféré, sinon header) + re-check membership. Mismatch → **403**. |
| **8 · Packages** | **Pas** de `@gosilex/rbac` vide. Constants/SQL/guards purs dans **`@gosilex/auth`** ; app wire Drizzle + routes + seed. `MODULE_IDS` reste **app-owned**. |
| **9 · SSoT** | Ce kit = schéma de convergence (Spark/Metalyde/Ether = inspiration). |

### Amendements panel (majorité / sécurité prime)

| Sujet | Draft initial | **ρ consensus** |
|-------|---------------|-----------------|
| **`platform_role` storage** | additionalField BA *ou* table kit | **Table kit `user_platform_roles`** (security + backend). Évite self-service BA updateUser. Architect acceptait additionalField ; panel retient kit table. |
| **`locked` sur org modules** | option Spark | **Colonne Phase A** (`DEFAULT 0`) ; **pas d’API/UX** tant que non testée. Si exposée plus tard : enforce server-side. |
| **Super_admin bypass** | membership bypass large | **Fail-closed** : read cross-org = flag `allowSuperAdmin` + **audit** ; **write** = break-glass **default off** (`allowSuperAdminWrite` par route). Staff : jamais. |
| **API keys multi-tenant** | non détaillé draft | **Org-bound** dès multi-tenant : `organization_id` (+ scopes) ; re-check membership ; mint **session only**. Keys subject-globales = **interdit**. |
| **Invitations Phase A** | BA invite | **OK si** role ceiling + email bind + TTL + pas de platform fields ; sinon **seed memberships only** jusqu’à threat model fermé. |
| **Adapter** | implicite | Features org/RBAC **uniquement** si `AUTH_SESSION_ADAPTER=better-auth` (HMAC = legacy demo sans org FKs). |

### Effective module access (normatif)

```text
can(user, org, module, op) =
  org.status = active
  AND membership.active (ou super_admin flag route)
  AND platform_modules.available
  AND organization_modules.enabled
  AND role_grant(role_key, module, op)   -- Phase A: code map
  AND (op ≠ write OR grant = write)
```

Solo client = même modèle : 1 org + 1 `owner` (UI peut cacher l’org).

---

## Rationale

1. **BA-only direction** déjà engagée (sessions) → réutiliser org/member/invite plutôt que réinventer (ω2).  
2. **Modules data-driven** (catalogue + per-client) ≠ BA AC statements statiques → tables kit.  
3. **Un seul chemin membership** pour staff → moins d’IDOR dual-path.  
4. **role_key string Phase A** laisse Phase B custom sans rewrite du spine BA.  
5. **Sécurité** : god-mode super_admin et keys multi-org = plus gros risques design ; panel les bride avant code.

---

## Trade-offs acceptés

- Couplage schéma BA org (versions plugin) vs contrôle total kit.  
- Dual mental model : `member.role` (BA) vs grants modules (kit) — frontière documentée.  
- Pendant HMAC encore default : multi-tenant demo **exige** adapter BA.  
- Custom roles / UI pas en Phase A (dette assumée, path figé).

---

## Alternatives rejetées

| ω | Par | Pourquoi rejeté |
|---|-----|-----------------|
| ω2 kit-only orgs | all | Invite/active-org réinventés ; coût sans gain Phase B |
| ω3 kit puis BA | all | Double migration + fenêtre IDOR |
| `org_grants` staff parallèle | all | Deux chemins authz |
| Matrice modules dans BA AC only | all | Pas data-driven per tenant |
| Super_admin write-all default | security (+ architect flag) | Blast radius silencieux |
| `@gosilex/rbac` package vide | arch + backend | ADR-0001 three-strikes |
| Templates platform live `org_id NULL` en B1 | security | Mutation cross-tenant |

---

## Dissent (mineur, enregistré)

| Sujet | Positions | Résolution ρ |
|-------|-----------|--------------|
| `platform_role` BA field vs kit table | Architect → additionalField ; Sec/BE → kit table | **Kit table** (2/3 + footgun self-update) |
| Super_admin write | Backend plus permissif (synthetic owner) ; Sec plus strict | **Sec gagne** : write opt-in per route |
| `locked` YAGNI total | Sec penchait YAGNI colonne | **Colonne cheap** + ignore API (arch+BE) |

Aucun dissent bloquant sur ω1 / modules 2 niveaux / 4 rôles / staff membership-only.

---

## Phase A schema freeze (pour ADR)

### Better Auth

- Tables plugin : `organization`, `member`, `invitation` (+ session active-org si requis 1.6).  
- Org additionalFields : `kind` (`client|internal`), `status` (`active|suspended|archived`).  
- `member.role` ∈ `owner|admin|member|reader` (allowlist serveur).

### Kit

```text
user_platform_roles (
  user_id TEXT PK,           -- FK logical → user.id
  role TEXT NOT NULL,        -- super_admin | staff
  updated_at INTEGER NOT NULL
)

platform_modules (
  module_id TEXT PK,
  available INTEGER NOT NULL,
  config_json TEXT,
  updated_at INTEGER NOT NULL
)

organization_modules (
  organization_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0,
  config_json TEXT,
  PRIMARY KEY (organization_id, module_id)
)
```

### Code-only Phase A

- Hierarchy `owner > admin > member > reader`  
- Default capability matrix (read/write/manage_members/manage_modules/delete_org)  
- Guards : `requireSession` → `requirePlatformRole?` → `requireOrgContext` → `requireOrgRole?` → `requireModule?`  
- App `MODULE_IDS` registry  

### Out of Phase A

- Custom roles tables/UI  
- `org_grants`  
- Live invite email (seed OK)  
- Drop HMAC (track A0 séparé)  
- Billing  

### Migration

- `kit_modules` → `platform_modules` (`enabled`→`available`)  
- Puis drop `kit_modules` après cutover services  

---

## Implementation notes (post-ADR)

| Phase | Scope |
|-------|--------|
| **A0** | BA-only session cutover (track parallèle) |
| **A1** | BA organization plugin + 4 roles + kind/status |
| **A2** | `user_platform_roles` + platform/org modules + migrate kit_modules |
| **A3** | Guards + seed multi-persona + **IDOR matrix CI** (sec I-01…I-28 condensed) |
| **A4** | Shells `/admin` + `/app` |
| **B** | Custom roles + matrice module write/read/disabled |

**API keys** : dès qu’un user a multi-org, keys **doivent** être org-scopées (même si mint UI suit A3).

**Invites** : ship API invite seulement avec role ceiling + email bind ; sinon seed-only.

---

## Blocking ξ avant code (ADR doit les écrire)

1. Pin schéma SQL BA org **1.6.x** (généré, pas inventé).  
2. Ordre résolution org : path > header > activeOrg ; mismatch 403.  
3. Contrat super_admin read/write flags + audit minimum.  
4. `platform_role` write path = super_admin only (kit table).  
5. Key org-binding design.  
6. Org suspended / member disabled behavior.  
7. Last-owner protection.  
8. Features org only on BA adapter.

---

## Next

1. ~~Validation humaine~~ → OK 2026-07-17 (seed-only invites, super_admin write default off, keys org-bound).  
2. ~~ADR-0003~~ → [`docs/architecture/adr/0003-multi-tenant-rbac-modules.md`](../../docs/architecture/adr/0003-multi-tenant-rbac-modules.md) **accepted**.  
3. Issues kit : epic multi-tenant + fermer/transférer silex-share#12.  
4. `/spec` ou `/plan` Phase A1–A3.
