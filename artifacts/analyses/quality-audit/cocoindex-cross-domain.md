# Cocoindex cross-domain — security & DRY confirmations

**Date:** 2026-07-12  
**Companion:** [`axial-drift/cocoindex-confirmations.md`](./axial-drift/cocoindex-confirmations.md)  
**Method:** same multi-file rg + source reads (ccc unavailable in confirmation agent)  
**Heuristic:** >0.85 confirmed · 0.7–0.85 probable · <0.6 discard

Cross-cuts findings that appear in **≥2 domains** (axial, architecture, security, code smells, error handling) so synthesis does not re-debate them.

---

## Confirmed cross-domain (DRY + security)

| Cluster | Domains | Severity (consensus) | Confirmation |
|---------|---------|----------------------|--------------|
| **D1 sqlite adapter ×3** | Smells P3 · Arch P3/P5 · (axial N×M) | **P1** | Near-identical prepare/bind/run/all/raw — **three-strikes met**. Promote `@gosilex/db/test`. |
| **Email transport in app** | Axial SEM-004 · Arch P3/P5 · Err BE-002 · Smells P3 | **P1** | Templates package-only; SMTP+false-success in `services/email.ts`. AGENTS H2 unmet. |
| **joinObjectKey prefix + raw R2 keys** | Sec P3 · Err BE-005 · Smells P3 · Arch P3 | **P1/P2** | Prefix not segment-validated; put/get/delete bypass join. Demo call sites safe under fixed `demo/`+UUID. |
| **createDb per-handler wiring** | Arch P3/P5 · Axial wiring debt | **P2** | ≥6 request-path factories; not a security bug, clone cost. |
| **Imperative requireAuth** | Arch P5 · Sec residual (omit-once) | **P1** | Dual-auth compose OK; not Hono middleware → open endpoint if forgotten. |
| **INTERNAL message leak** | Err BE-001 · Sec P5 residual | **P1** | `toApiErrorBody` passes through `AppError.internal` config text. |
| **Session exp shape / PBKDF2 bounds** | Sec P2 · (Err/auth) | **P1** | Package-level: missing `exp` type check; unbounded iterations on verify. |
| **FE ApiError incomplete kit** | Axial SEM-003 · Err FE · (Arch P6) | **P1/P2** | App-local client; dead `isUnauthorized`; no `apiErrorToMessage` / global Query onError. |
| **MCP exact allowlist + product lexicon** | Arch P3 · Smells P3 · Sec P3 (least-priv OK) | **P1/P2** | Hard `ping`/`whoami` lock-in + `share_`/`artifact` strings in kit; whoami presence-only. |

---

## Confirmed healthy cross-cuts (do not “fix”)

| Cluster | Domains | Confirmation |
|---------|---------|--------------|
| **AppError SSoT** | Axial OK · Err BE · Arch P5 | Single class in `@gosilex/core`; apps import factories |
| **Crypto package composition** | Axial OK · Sec P2 · Arch P5 | No password/session/key reimplementation in apps |
| **packages ↛ apps** | Axial structural · Arch all | Zero reverse imports |
| **No product share under packages** | Axial · banlist · Sec | Guards only |
| **Parameterized SQL via Drizzle** | Sec P3 · Arch | No raw SQL builders in packages; app repos use `eq`/`and` |

---

## Probable only (not three-strikes yet)

| Cluster | Domains | Why probable |
|---------|---------|--------------|
| Hono middleware promote (`requestId`, headers, `onError`) | Axial SEM-001 · Arch P5 · Err BE | 1 API app |
| session-env ops helpers | Axial SEM-002 · Arch P5 | 1 call site cluster |
| Zod validation ceremony | Err BE-003 · Smells | 2 body routes |
| KitRole type mirror | Axial SEM-005 | Weak type-level |

---

## Discarded cross-claims

| Claim | Why |
|-------|-----|
| Multi-app copy of requireAuth / AppError / crypto | Single implementations; package compose |
| Three-strikes on middleware / FE client | Insufficient sibling apps |
| Email package owns SMTP | False — opposite |

---

## Synthesis priority (security × DRY)

```text
P1 ship blockers before product apps:
  1. D1 test double extract          (DRY three-strikes)
  2. requireAuth → route middleware  (sec omit-once)
  3. joinObjectKey prefix harden     (sec path)
  4. toApiErrorBody redact 5xx       (sec leak)
  5. verifySession + PBKDF2 bounds   (sec auth)
  6. Email transport promote + no false ok (DRY + ops)

Before share-api / share-web:
  7. Hono platform middleware package
  8. FE apiFetch / ApiError kit package
  9. MCP allowlist soften for product tools
```

---

## Axial report support matrix (short)

| Axial report finding class | Cocoindex/rg support |
|----------------------------|----------------------|
| Confirmed three-strikes apps | **None** (expected) |
| Probable target-axis traps (SEM-001…004) | **Supported** as probable/confirmed surfaces |
| Aligned composition (OK-01…06) | **Supported** |
| Structural DAG clean | **Supported** (importlinter + rg) |
| Secondary axis users-repo hole | **Supported** (login SQL in service) |

Full tables: [`axial-drift/cocoindex-confirmations.md`](./axial-drift/cocoindex-confirmations.md).
