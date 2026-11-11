-- ADR-0007 dogfood — kit_tasks + kit_comments (org-scoped)
-- Applied SSoT (packages/*/migrations are sketches only).

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

CREATE TABLE IF NOT EXISTS "kit_comments" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "author_id" text NOT NULL,
  "body" text NOT NULL,
  "visibility" text NOT NULL DEFAULT 'shared',
  "created_at" integer NOT NULL,
  "updated_at" integer NOT NULL
);
CREATE INDEX IF NOT EXISTS "kit_comments_org_target_idx"
  ON "kit_comments" ("org_id", "target_type", "target_id");
