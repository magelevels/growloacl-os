-- Persist the owner-facing next-move campaign drafts alongside each workspace.
-- The Worker still validates every field before this JSON is stored.
ALTER TABLE client_workspaces ADD COLUMN campaigns TEXT NOT NULL DEFAULT '[]';
