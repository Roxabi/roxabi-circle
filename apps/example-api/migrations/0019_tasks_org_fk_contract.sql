-- kit:contract released=78966e9952a95e0ac8f5da3bfb27aab1649074b4
--
-- ADR-0016 contract — kit_task_assignees.org_id NOT NULL + composite tenancy FKs
-- (task_id, org_id) -> kit_tasks (id, org_id) on kit_task_assignees and on both ends of
-- kit_task_links. Rows that violate the rule are DELETED, not repaired.
--
-- HUMAN PRECONDITION (per live D1 database, before this runs). Count what will be purged:
--   SELECT count(*) FROM kit_task_assignees a
--     WHERE NOT EXISTS (SELECT 1 FROM kit_tasks t WHERE t.id = a.task_id
--                       AND t.org_id = COALESCE(a.org_id, t.org_id));
--   SELECT count(*) FROM kit_task_links l
--     WHERE NOT EXISTS (SELECT 1 FROM kit_tasks t WHERE t.id = l.from_task_id AND t.org_id = l.org_id)
--        OR NOT EXISTS (SELECT 1 FROM kit_tasks t WHERE t.id = l.to_task_id   AND t.org_id = l.org_id);
-- Any non-zero count is cross-tenant corruption: inspect those rows first. The purge is irreversible
-- except by D1 Time Travel (docs/kit/deploy-cloudflare.md § 5b).
--
-- Never rebuild kit_tasks here: on D1, DROP of a parent runs ON DELETE CASCADE on its children.
-- Products: sync and deploy `tasks_assignees_org` BEFORE syncing this id.
PRAGMA defer_foreign_keys = on;

UPDATE "kit_task_assignees"
SET "org_id" = (
  SELECT t."org_id" FROM "kit_tasks" t WHERE t."id" = "kit_task_assignees"."task_id"
)
WHERE "org_id" IS NULL;

DELETE FROM "kit_task_assignees"
WHERE NOT EXISTS (
  SELECT 1 FROM "kit_tasks" t
  WHERE t."id" = "kit_task_assignees"."task_id" AND t."org_id" = "kit_task_assignees"."org_id"
);

CREATE TABLE "kit_task_assignees_new" (
  "org_id" text NOT NULL,
  "task_id" text NOT NULL,
  "user_id" text NOT NULL,
  "created_at" integer NOT NULL,
  PRIMARY KEY ("task_id", "user_id"),
  FOREIGN KEY ("task_id", "org_id") REFERENCES "kit_tasks" ("id", "org_id") ON DELETE CASCADE
);
INSERT INTO "kit_task_assignees_new" ("org_id", "task_id", "user_id", "created_at")
  SELECT "org_id", "task_id", "user_id", "created_at" FROM "kit_task_assignees";
DROP TABLE "kit_task_assignees";
ALTER TABLE "kit_task_assignees_new" RENAME TO "kit_task_assignees";
CREATE INDEX "kit_task_assignees_org_task_idx" ON "kit_task_assignees" ("org_id", "task_id");
CREATE INDEX "kit_task_assignees_org_user_idx" ON "kit_task_assignees" ("org_id", "user_id");

-- A link whose org differs from either task's org is cross-tenant corruption.
DELETE FROM "kit_task_links"
WHERE NOT EXISTS (
    SELECT 1 FROM "kit_tasks" t
    WHERE t."id" = "kit_task_links"."from_task_id" AND t."org_id" = "kit_task_links"."org_id")
   OR NOT EXISTS (
    SELECT 1 FROM "kit_tasks" t
    WHERE t."id" = "kit_task_links"."to_task_id" AND t."org_id" = "kit_task_links"."org_id");

CREATE TABLE "kit_task_links_new" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "from_task_id" text NOT NULL,
  "to_task_id" text NOT NULL,
  "kind" text NOT NULL,
  "created_at" integer NOT NULL,
  UNIQUE ("from_task_id", "to_task_id", "kind"),
  FOREIGN KEY ("from_task_id", "org_id") REFERENCES "kit_tasks" ("id", "org_id") ON DELETE CASCADE,
  FOREIGN KEY ("to_task_id", "org_id") REFERENCES "kit_tasks" ("id", "org_id") ON DELETE CASCADE
);
INSERT INTO "kit_task_links_new" ("id", "org_id", "from_task_id", "to_task_id", "kind", "created_at")
  SELECT "id", "org_id", "from_task_id", "to_task_id", "kind", "created_at" FROM "kit_task_links";
DROP TABLE "kit_task_links";
ALTER TABLE "kit_task_links_new" RENAME TO "kit_task_links";
CREATE INDEX "kit_task_links_org_idx" ON "kit_task_links" ("org_id");

PRAGMA defer_foreign_keys = off;
