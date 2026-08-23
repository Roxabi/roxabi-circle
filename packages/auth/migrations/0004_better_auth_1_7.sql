-- SKETCH / REFERENCE ONLY — NOT applied by wrangler.
-- Applied SSoT: apps/example-api/migrations/0014_better_auth_1_7_additive.sql (kit-schema-sync).
-- Better Auth 1.7 scopes account identities by (issuer, account_id).
-- Keep the database compatible with the previous Worker during deployment:
-- legacy inserts omit issuer and receive the credential default.
--
-- Fail before altering account if production data violates the credential-only
-- invariant or contains identities that would collide in the new unique index.

CREATE TABLE IF NOT EXISTS "__kit_better_auth_1_7_guard" (
  "ok" integer NOT NULL CHECK ("ok" = 1)
);

DELETE FROM "__kit_better_auth_1_7_guard";

INSERT INTO "__kit_better_auth_1_7_guard" ("ok")
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM "account"
      WHERE "provider_id" <> 'credential' OR "account_id" <> "user_id"
    ) OR EXISTS (
      SELECT 1
      FROM "account"
      GROUP BY "account_id"
      HAVING COUNT(*) > 1
    )
      THEN NULL
    ELSE 1
  END;

DROP TABLE "__kit_better_auth_1_7_guard";

ALTER TABLE "account"
  ADD COLUMN "issuer" text NOT NULL DEFAULT 'local:credential';

CREATE UNIQUE INDEX "account_issuer_accountId_uidx"
  ON "account" ("issuer", "account_id");
