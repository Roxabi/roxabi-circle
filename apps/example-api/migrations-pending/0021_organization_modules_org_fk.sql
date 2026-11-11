-- PENDING — NOT APPLIED; outside the Wrangler journal and schema catalog.
-- Before promotion, record this count for EACH live D1 database:
-- SELECT count(*) FROM organization_modules WHERE organization_id NOT IN (SELECT id FROM organization);
-- Any nonzero count requires explicit purge approval per database; inspect affected rows first.
-- Before promotion, inventory inbound foreign keys per database with:
-- SELECT m.name, f."table", f."from", f."to", f.on_delete
-- FROM sqlite_schema m JOIN pragma_foreign_key_list(m.name) f
-- WHERE m.type = 'table' AND lower(substr(m.name, 1, 4)) <> '_cf_'
--   AND lower(f."table") = 'organization_modules';
-- D1 reserves _cf_ names; the filtered inventory query was exercised on non-production D1.
-- Any inbound FK is a promotion hold, including RESTRICT/NO ACTION and CASCADE; DROP can
-- delete Product children or fail. Resolve the dependency with a separately reviewed migration,
-- never generic save/restore. Confirm the preflight works on the authorized non-production D1.
-- Rollback of the purge/rebuild is only via D1 Time Travel (docs/kit/deploy-cloudflare.md § 5b).
-- Promotion: choose the next free journal number after all prior migrations, move this file to
-- migrations/, add -- kit:contract released=<40-hex sha> on its own line (a qualifying deployed
-- ancestor of every origin/deploy/*, per scripts/kit/check-migrations-contract.ts), append a
-- catalog id organization_modules_org_fk in set core with the file's SHA-256, and update tests.
-- Record per-database counts and approvals; run and verify on an authorized non-production D1,
-- then complete migration contract, Wrangler, schema-sync and documentation checks before release.
-- Fail before any purge or rebuild when a table references the table being rebuilt.
CREATE TABLE "_kit_org_modules_fk_preflight" ("inbound_count" integer NOT NULL CHECK ("inbound_count" = 0));
INSERT INTO "_kit_org_modules_fk_preflight"
SELECT count(*) FROM sqlite_schema m JOIN pragma_foreign_key_list(m.name) f
WHERE m.type = 'table' AND lower(substr(m.name, 1, 4)) <> '_cf_'
  AND lower(f."table") = 'organization_modules';
DROP TABLE "_kit_org_modules_fk_preflight";
DELETE FROM "organization_modules" WHERE "organization_id" NOT IN (SELECT "id" FROM "organization");
CREATE TABLE "organization_modules_new" (
  "organization_id" text NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  "module_id" text NOT NULL,
  "enabled" integer NOT NULL DEFAULT 0,
  "locked" integer NOT NULL DEFAULT 0,
  "config_json" text,
  "updated_at" integer NOT NULL,
  PRIMARY KEY ("organization_id", "module_id")
);
INSERT INTO "organization_modules_new" SELECT "organization_id", "module_id", "enabled", "locked", "config_json", "updated_at" FROM "organization_modules";
DROP TABLE "organization_modules";
ALTER TABLE "organization_modules_new" RENAME TO "organization_modules";
CREATE INDEX "organization_modules_org_idx" ON "organization_modules" ("organization_id");
