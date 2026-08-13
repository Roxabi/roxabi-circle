-- SKETCH / REFERENCE ONLY — NOT applied by wrangler.
-- Applied SSoT: apps/example-api/migrations/ (dogfood tranche).

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
CREATE INDEX IF NOT EXISTS "kit_comments_org_author_idx"
  ON "kit_comments" ("org_id", "author_id");
