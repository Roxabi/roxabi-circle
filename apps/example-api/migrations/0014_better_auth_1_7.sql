-- Better Auth 1.7 scopes account identities by (issuer, account_id).
-- This kit config only creates credential accounts. The CASE intentionally
-- yields NULL for any unexpected provider so the NOT NULL copy fails closed
-- instead of inventing a trusted issuer.

DROP TABLE IF EXISTS "account_ba_1_7";

CREATE TABLE "account_ba_1_7" (
  "id" text PRIMARY KEY NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "issuer" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "user" ("id") ON DELETE cascade,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" integer,
  "refresh_token_expires_at" integer,
  "scope" text,
  "password" text,
  "created_at" integer NOT NULL,
  "updated_at" integer NOT NULL
);

INSERT INTO "account_ba_1_7" (
  "id",
  "account_id",
  "provider_id",
  "issuer",
  "user_id",
  "access_token",
  "refresh_token",
  "id_token",
  "access_token_expires_at",
  "refresh_token_expires_at",
  "scope",
  "password",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "account_id",
  "provider_id",
  CASE
    WHEN "provider_id" = 'credential' AND "account_id" = "user_id"
      THEN 'local:credential'
    ELSE NULL
  END,
  "user_id",
  "access_token",
  "refresh_token",
  "id_token",
  "access_token_expires_at",
  "refresh_token_expires_at",
  "scope",
  "password",
  "created_at",
  "updated_at"
FROM "account";

CREATE UNIQUE INDEX "account_issuer_accountId_uidx"
  ON "account_ba_1_7" ("issuer", "account_id");

DROP TABLE "account";
ALTER TABLE "account_ba_1_7" RENAME TO "account";

CREATE INDEX "account_userId_idx" ON "account" ("user_id");
