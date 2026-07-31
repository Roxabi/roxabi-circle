-- ADR-0003 Phase B — per-org custom roles + module grants (Spark #127 / GH #22).

CREATE TABLE IF NOT EXISTS "organization_roles" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "is_system" integer NOT NULL DEFAULT 0,
  "created_at" integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "organization_roles_org_key_uidx"
  ON "organization_roles" ("organization_id", "key");
CREATE INDEX IF NOT EXISTS "organization_roles_org_idx"
  ON "organization_roles" ("organization_id");

CREATE TABLE IF NOT EXISTS "organization_role_module_grants" (
  "role_id" text NOT NULL,
  "module_id" text NOT NULL,
  "access" text NOT NULL,
  PRIMARY KEY ("role_id", "module_id")
);
CREATE INDEX IF NOT EXISTS "organization_role_module_grants_role_idx"
  ON "organization_role_module_grants" ("role_id");
