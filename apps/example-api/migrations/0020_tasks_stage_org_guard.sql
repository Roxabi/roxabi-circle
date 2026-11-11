-- Guard stage ownership without rebuilding kit_tasks: product children may cascade on DROP.
-- Any future rebuild of kit_tasks or kit_task_stages must recreate these triggers and index.
CREATE UNIQUE INDEX IF NOT EXISTS "kit_task_stages_id_org_uidx" ON "kit_task_stages" ("id", "org_id");

CREATE TRIGGER IF NOT EXISTS "kit_tasks_stage_org_ins"
BEFORE INSERT ON "kit_tasks"
WHEN NOT EXISTS (SELECT 1 FROM "kit_task_stages" WHERE "id" = NEW."stage_id" AND "org_id" = NEW."org_id")
BEGIN
  SELECT RAISE(ABORT, 'task stage must belong to task organization');
END;

CREATE TRIGGER IF NOT EXISTS "kit_tasks_stage_org_upd"
BEFORE UPDATE OF "stage_id", "org_id" ON "kit_tasks"
WHEN NOT EXISTS (SELECT 1 FROM "kit_task_stages" WHERE "id" = NEW."stage_id" AND "org_id" = NEW."org_id")
BEGIN
  SELECT RAISE(ABORT, 'task stage must belong to task organization');
END;

CREATE TRIGGER IF NOT EXISTS "kit_task_stages_org_immutable"
BEFORE UPDATE OF "id", "org_id" ON "kit_task_stages"
WHEN (NEW."org_id" IS NOT OLD."org_id" AND EXISTS (SELECT 1 FROM "kit_tasks" WHERE "stage_id" = OLD."id"))
  OR EXISTS (SELECT 1 FROM "kit_tasks" WHERE "stage_id" = NEW."id" AND "org_id" IS NOT NEW."org_id")
BEGIN
  SELECT RAISE(ABORT, 'referenced task stage organization is immutable');
END;

-- Includes REPLACE and deferred delete/reinsert, even when the old stage no longer exists.
CREATE TRIGGER IF NOT EXISTS "kit_task_stages_org_replace_guard"
BEFORE INSERT ON "kit_task_stages"
WHEN EXISTS (
  SELECT 1 FROM "kit_tasks" WHERE "stage_id" = NEW."id" AND "org_id" IS NOT NEW."org_id"
)
BEGIN
  SELECT RAISE(ABORT, 'referenced task stage organization is immutable');
END;
