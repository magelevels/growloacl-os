ALTER TABLE leads ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high'));
ALTER TABLE leads ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN next_action TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads(priority);
CREATE INDEX IF NOT EXISTS idx_leads_updated_at ON leads(updated_at DESC);
