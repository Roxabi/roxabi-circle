-- B6 P2 #82 — MasterData referential demo (demo_items)
CREATE TABLE IF NOT EXISTS "demo_items" (
  "id" text PRIMARY KEY NOT NULL,
  "subject" text NOT NULL,
  "code" text NOT NULL,
  "label" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "active" integer NOT NULL DEFAULT 1,
  "created_at" integer NOT NULL,
  "updated_at" integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "demo_items_subject_code_uidx" ON "demo_items" ("subject", "code");
CREATE INDEX IF NOT EXISTS "demo_items_subject_idx" ON "demo_items" ("subject");
