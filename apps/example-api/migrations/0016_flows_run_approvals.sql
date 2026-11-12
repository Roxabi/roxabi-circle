-- #32 — flow_run_approvals (ADR-0005 D4 HITL, option A).
-- The decision row is the only authorization. Additive unique (id, org_id)
-- on flow_runs lets the composite FK bind each approval to the run's org.

CREATE UNIQUE INDEX IF NOT EXISTS "flow_runs_id_org_uidx" ON "flow_runs" ("id", "org_id");

CREATE TABLE IF NOT EXISTS "flow_run_approvals" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "run_id" text NOT NULL,
  "task_id" text NOT NULL,
  "decision" text NOT NULL CHECK ("decision" IN ('approved', 'rejected', 'expired')),
  "decided_by" text NOT NULL,
  "decided_at" integer NOT NULL,
  UNIQUE ("run_id", "task_id"),
  FOREIGN KEY ("run_id", "org_id") REFERENCES "flow_runs" ("id", "org_id")
);

CREATE INDEX IF NOT EXISTS "flow_run_approvals_org_idx" ON "flow_run_approvals" ("org_id");
