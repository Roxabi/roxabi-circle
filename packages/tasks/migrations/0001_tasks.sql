-- SKETCH / REFERENCE ONLY — NOT applied by wrangler.
-- Applied SSoT will live under apps/example-api/migrations/ (dogfood tranche).
-- org_id NOT NULL on every row. Integer ms timestamps preferred in applied migration.
-- Resource links intentionally omitted (deferred until resource system).

CREATE TABLE IF NOT EXISTS "kit_task_stages" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "board_key" text NOT NULL,
  "label" text NOT NULL,
  "position" integer NOT NULL,
  "is_default" integer NOT NULL DEFAULT 0,
  "is_terminal" integer NOT NULL DEFAULT 0,
  "created_at" integer NOT NULL,
  "updated_at" integer NOT NULL
);

CREATE INDEX IF NOT EXISTS "kit_task_stages_org_board_idx"
  ON "kit_task_stages" ("org_id", "board_key", "position");

CREATE TABLE IF NOT EXISTS "kit_tasks" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "board_key" text NOT NULL,
  "stage_id" text NOT NULL,
  "visibility" text NOT NULL DEFAULT 'shared',
  "scope_kind" text,
  "scope_id" text,
  "priority" text,
  "due_at" integer,
  "done" integer NOT NULL DEFAULT 0,
  "order_index" integer NOT NULL DEFAULT 0,
  "external_url" text,
  "created_by" text NOT NULL,
  "created_at" integer NOT NULL,
  "updated_at" integer NOT NULL,
  FOREIGN KEY ("stage_id") REFERENCES "kit_task_stages" ("id")
);

CREATE INDEX IF NOT EXISTS "kit_tasks_org_idx" ON "kit_tasks" ("org_id");
CREATE INDEX IF NOT EXISTS "kit_tasks_org_board_stage_idx"
  ON "kit_tasks" ("org_id", "board_key", "stage_id");
CREATE INDEX IF NOT EXISTS "kit_tasks_org_scope_idx"
  ON "kit_tasks" ("org_id", "scope_kind", "scope_id");

CREATE TABLE IF NOT EXISTS "kit_task_assignees" (
  "task_id" text NOT NULL,
  "user_id" text NOT NULL,
  "created_at" integer NOT NULL,
  PRIMARY KEY ("task_id", "user_id"),
  FOREIGN KEY ("task_id") REFERENCES "kit_tasks" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "kit_task_assignees_user_idx"
  ON "kit_task_assignees" ("user_id");

CREATE TABLE IF NOT EXISTS "kit_task_links" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "from_task_id" text NOT NULL,
  "to_task_id" text NOT NULL,
  "kind" text NOT NULL,
  "created_at" integer NOT NULL,
  UNIQUE ("from_task_id", "to_task_id", "kind"),
  FOREIGN KEY ("from_task_id") REFERENCES "kit_tasks" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("to_task_id") REFERENCES "kit_tasks" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "kit_task_links_org_idx" ON "kit_task_links" ("org_id");
