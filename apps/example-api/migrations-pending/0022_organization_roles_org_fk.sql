-- PENDING — NOT APPLIED; outside the Wrangler journal and schema catalog. Requires the rbac set.
-- Before promotion, record these counts for EACH live D1 database:
-- SELECT count(*) FROM organization_roles WHERE organization_id NOT IN (SELECT id FROM organization);
-- SELECT count(*) FROM organization_role_module_grants WHERE role_id NOT IN (SELECT id FROM organization_roles);
-- SELECT count(*) FROM organization_role_module_grants WHERE role_id IN
--   (SELECT id FROM organization_roles WHERE organization_id NOT IN (SELECT id FROM organization));
-- Any nonzero count requires explicit purge approval per database; inspect affected rows first.
-- Before promotion, inventory inbound foreign keys per database with:
-- SELECT m.name, f."table", f."from", f."to", f.on_delete
-- FROM sqlite_schema m JOIN pragma_foreign_key_list(m.name) f
-- WHERE m.type = 'table' AND lower(substr(m.name, 1, 4)) <> '_cf_'
--   AND lower(f."table") IN ('organization_roles', 'organization_role_module_grants');
-- D1 reserves _cf_ names; the filtered inventory query was exercised on non-production D1.
-- Any inbound FK is a promotion hold, including RESTRICT/NO ACTION and CASCADE; DROP can
-- delete Product children or fail. Resolve the dependency with a separately reviewed migration,
-- never generic save/restore. The original Kit grants table has no role FK, so rebuilding roles
-- before grants is safe only when this inventory is empty. Confirm the preflight on non-production D1.
-- Rollback of the purge/rebuild is only via D1 Time Travel (docs/kit/deploy-cloudflare.md § 5b).
-- Promotion: choose the next free journal number after all prior migrations, move this file to
-- migrations/, add -- kit:contract released=<40-hex sha> on its own line (a qualifying deployed
-- ancestor of every origin/deploy/*, per scripts/kit/check-migrations-contract.ts), append a
-- catalog id organization_roles_org_fk in set rbac with the file's SHA-256, and update tests.
-- Record per-database counts and approvals; run and verify on an authorized non-production D1,
-- then complete migration contract, Wrangler, schema-sync and documentation checks before release.
-- Fail before any purge or rebuild when a table references either rebuilt table.
CREATE TABLE "_kit_org_roles_fk_preflight" ("inbound_count" integer NOT NULL CHECK ("inbound_count" = 0));
INSERT INTO "_kit_org_roles_fk_preflight"
SELECT count(*) FROM sqlite_schema m JOIN pragma_foreign_key_list(m.name) f
WHERE m.type = 'table' AND lower(substr(m.name, 1, 4)) <> '_cf_'
  AND lower(f."table") IN ('organization_roles', 'organization_role_module_grants');
DROP TABLE "_kit_org_roles_fk_preflight";
DELETE FROM "organization_roles" WHERE "organization_id" NOT IN (SELECT "id" FROM "organization");
DELETE FROM "organization_role_module_grants" WHERE "role_id" NOT IN (SELECT "id" FROM "organization_roles");
CREATE TABLE "organization_roles_new" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "is_system" integer NOT NULL DEFAULT 0,
  "created_at" integer NOT NULL
);
INSERT INTO "organization_roles_new" SELECT "id", "organization_id", "key", "name", "is_system", "created_at" FROM "organization_roles";
DROP TABLE "organization_roles";
ALTER TABLE "organization_roles_new" RENAME TO "organization_roles";
CREATE UNIQUE INDEX "organization_roles_org_key_uidx" ON "organization_roles" ("organization_id", "key");
CREATE INDEX "organization_roles_org_idx" ON "organization_roles" ("organization_id");
CREATE TABLE "organization_role_module_grants_new" (
  "role_id" text NOT NULL REFERENCES "organization_roles" ("id") ON DELETE CASCADE,
  "module_id" text NOT NULL,
  "access" text NOT NULL,
  PRIMARY KEY ("role_id", "module_id")
);
INSERT INTO "organization_role_module_grants_new" SELECT "role_id", "module_id", "access" FROM "organization_role_module_grants";
DROP TABLE "organization_role_module_grants";
ALTER TABLE "organization_role_module_grants_new" RENAME TO "organization_role_module_grants";
CREATE INDEX "organization_role_module_grants_role_idx" ON "organization_role_module_grants" ("role_id");
