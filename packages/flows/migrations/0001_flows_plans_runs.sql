-- @kit/flows D1 sketch (ADR-0005) — product/example-api applies its own migration copy (#29).
-- org_id NOT NULL on every row.

CREATE TABLE IF NOT EXISTS "flow_plans" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "plan_key" text NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "enabled" integer NOT NULL DEFAULT 1,
  "yaml_source" text,
  "plan_json" text NOT NULL,
  "plan_digest" text NOT NULL,
  "created_by" text,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL,
  UNIQUE ("org_id", "plan_key", "version")
);

CREATE INDEX IF NOT EXISTS "flow_plans_org_idx" ON "flow_plans" ("org_id");

CREATE TABLE IF NOT EXISTS "flow_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "plan_id" text NOT NULL,
  "plan_key" text NOT NULL,
  "status" text NOT NULL,
  "actor_id" text NOT NULL,
  "snapshot_json" text NOT NULL,
  "plan_digest" text NOT NULL,
  "workflow_instance_id" text,
  "receipt_json" text,
  "error_code" text,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL,
  FOREIGN KEY ("plan_id") REFERENCES "flow_plans" ("id")
);

CREATE INDEX IF NOT EXISTS "flow_runs_org_idx" ON "flow_runs" ("org_id");
CREATE INDEX IF NOT EXISTS "flow_runs_plan_idx" ON "flow_runs" ("plan_id");
