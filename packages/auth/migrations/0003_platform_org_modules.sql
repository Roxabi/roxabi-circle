-- Kit multi-tenant authz (ADR-0003) — platform roles + dual-level modules.
-- organization_id references BA organization.id (logical FK).

CREATE TABLE IF NOT EXISTS "user_platform_roles" (
  "user_id" text PRIMARY KEY NOT NULL,
  "role" text NOT NULL,
  "updated_at" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "platform_modules" (
  "module_id" text PRIMARY KEY NOT NULL,
  "available" integer NOT NULL DEFAULT 0,
  "config_json" text,
  "updated_at" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "organization_modules" (
  "organization_id" text NOT NULL,
  "module_id" text NOT NULL,
  "enabled" integer NOT NULL DEFAULT 0,
  "locked" integer NOT NULL DEFAULT 0,
  "config_json" text,
  "updated_at" integer NOT NULL,
  PRIMARY KEY ("organization_id", "module_id")
);
CREATE INDEX IF NOT EXISTS "organization_modules_org_idx" ON "organization_modules" ("organization_id");
