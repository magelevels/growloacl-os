-- Store client workspace state by verified Supabase user ID.
-- Authorization is enforced in the Worker before this table is read or written.
CREATE TABLE IF NOT EXISTS client_workspaces (
  user_id TEXT PRIMARY KEY NOT NULL,
  business_name TEXT NOT NULL,
  business_type TEXT NOT NULL DEFAULT '',
  business_location TEXT NOT NULL DEFAULT '',
  primary_goal TEXT NOT NULL DEFAULT '',
  usp TEXT NOT NULL DEFAULT '',
  plan_done TEXT NOT NULL DEFAULT '{}',
  leads TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_client_workspaces_updated_at ON client_workspaces(updated_at DESC);
