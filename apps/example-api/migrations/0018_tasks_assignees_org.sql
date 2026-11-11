-- ADR-0016 expand — task-family child rows carry the owner org (tenant of record).
-- Additive only: unique (id, org_id) on kit_tasks, nullable kit_task_assignees.org_id
-- backfilled from the owning task, and org-first indexes. kit_task_links already has org_id.
--
-- NOT NULL on org_id and the composite tenancy FKs (assignees, links) are the contract step,
-- shipped in a LATER release (a rebuild is destructive: it needs `-- kit:contract released=<sha>`
-- of a deployed release of this file). Never rebuild kit_tasks: on D1, DROP of a parent runs
-- ON DELETE CASCADE and wipes the children.
--
-- Rows an older Worker inserts between this migration and the deploy have org_id NULL:
-- code of this release reads and deletes assignees through the owning task's org, not
-- through kit_task_assignees.org_id.

CREATE UNIQUE INDEX IF NOT EXISTS "kit_tasks_id_org_uidx" ON "kit_tasks" ("id", "org_id");

ALTER TABLE "kit_task_assignees" ADD COLUMN "org_id" text;

UPDATE "kit_task_assignees"
SET "org_id" = (
  SELECT t."org_id" FROM "kit_tasks" t WHERE t."id" = "kit_task_assignees"."task_id"
)
WHERE "org_id" IS NULL;

CREATE INDEX IF NOT EXISTS "kit_task_assignees_org_task_idx"
  ON "kit_task_assignees" ("org_id", "task_id");
CREATE INDEX IF NOT EXISTS "kit_task_assignees_org_user_idx"
  ON "kit_task_assignees" ("org_id", "user_id");
