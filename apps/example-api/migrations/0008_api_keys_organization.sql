-- Org-bound API keys (ADR-0003 D11). Existing rows get empty org (must re-mint).
ALTER TABLE "api_keys" ADD COLUMN "organization_id" text;
CREATE INDEX IF NOT EXISTS "api_keys_organization_id_idx" ON "api_keys" ("organization_id");
