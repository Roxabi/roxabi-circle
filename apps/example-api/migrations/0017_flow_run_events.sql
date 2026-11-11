-- #230 — flow_run_events (ADR-0005 observability). Append-only org-scoped trail.
-- No output column (redaction is #231). Not a second snapshot. Additive only.

CREATE TABLE IF NOT EXISTS "flow_run_events" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "run_id" text NOT NULL,
  "seq" integer NOT NULL,
  "kind" text NOT NULL CHECK ("kind" IN ('status', 'receipt')),
  "status_from" text,
  "status_to" text,
  "task_id" text,
  "outcome" text,
  "error_code" text,
  "created_at" integer NOT NULL,
  UNIQUE ("run_id", "seq"),
  FOREIGN KEY ("run_id", "org_id") REFERENCES "flow_runs" ("id", "org_id")
);

CREATE INDEX IF NOT EXISTS "flow_run_events_org_idx" ON "flow_run_events" ("org_id");
