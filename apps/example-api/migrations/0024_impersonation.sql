CREATE TABLE impersonation_role_permissions (
  role TEXT PRIMARY KEY NOT NULL CHECK (role IN ('staff', 'super_admin')),
  read INTEGER NOT NULL DEFAULT 0,
  write INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE impersonation_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL UNIQUE REFERENCES session(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  subject_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('read', 'write')),
  created_at INTEGER NOT NULL,
  CHECK (actor_user_id <> subject_user_id)
);
