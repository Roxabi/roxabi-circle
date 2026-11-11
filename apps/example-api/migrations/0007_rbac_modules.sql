-- Kit multi-tenant authz (ADR-0003) — platform roles + dual-level modules.
-- Migrates kit_modules → platform_modules (enabled → available).

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

-- Migrate legacy global kit_modules → platform catalogue
INSERT OR IGNORE INTO "platform_modules" ("module_id", "available", "config_json", "updated_at")
SELECT "id", "enabled", "config_json", "updated_at" FROM "kit_modules";
