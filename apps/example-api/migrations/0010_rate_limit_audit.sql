-- B-auth-harden #61 — durable rate-limit buckets + audit_events.

CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
  "bucket_key" text NOT NULL,
  "window_start_ms" integer NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("bucket_key", "window_start_ms")
);

CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" integer NOT NULL,
  "actor_user_id" text,
  "action" text NOT NULL,
  "target_type" text,
  "target_id" text,
  "org_id" text,
  "ip" text,
  "meta_json" text
);

CREATE INDEX IF NOT EXISTS "audit_events_created_at_id_idx"
  ON "audit_events" ("created_at" DESC, "id");

-- Idempotent first_login: one row per user target.
CREATE UNIQUE INDEX IF NOT EXISTS "audit_events_first_login_uidx"
  ON "audit_events" ("action", "target_id")
  WHERE "action" = 'first_login' AND "target_id" IS NOT NULL;
