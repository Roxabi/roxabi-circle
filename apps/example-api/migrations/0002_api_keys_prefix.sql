-- Upgrade path for DBs created with 0001 before key_prefix/name/expires_at.
-- Fresh installs use 0001_init.sql which already includes these columns;
-- this migration is best-effort (SQLite ignores duplicate column errors when re-run carefully).

-- Note: Wrangler applies migrations once; local memory-env applies all *.sql in order.
-- For existing tables without columns, ADD COLUMN.

ALTER TABLE api_keys ADD COLUMN key_prefix TEXT;
ALTER TABLE api_keys ADD COLUMN name TEXT;
ALTER TABLE api_keys ADD COLUMN expires_at INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_prefix_uq ON api_keys(key_prefix);
