-- Apply once after 0001 and 0002. No table rebuilds or deleted leads.
ALTER TABLE leads ADD COLUMN pipeline_stage TEXT CHECK (pipeline_stage IN ('new','contacted','qualified','audit_ready','proposal_sent','won','lost','archived'));
ALTER TABLE leads ADD COLUMN setup_fee REAL NOT NULL DEFAULT 0 CHECK (setup_fee >= 0 AND setup_fee <= 100000000);
ALTER TABLE leads ADD COLUMN monthly_value REAL NOT NULL DEFAULT 0 CHECK (monthly_value >= 0 AND monthly_value <= 100000000);
ALTER TABLE leads ADD COLUMN probability INTEGER NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100);
ALTER TABLE leads ADD COLUMN next_action_date TEXT;
ALTER TABLE leads ADD COLUMN qualification TEXT NOT NULL DEFAULT '[]';
ALTER TABLE leads ADD COLUMN prospect_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN audit_findings TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN audit_recommendations TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN proposal_status TEXT NOT NULL DEFAULT 'not_started' CHECK (proposal_status IN ('not_started','draft','sent','accepted','declined'));
ALTER TABLE leads ADD COLUMN proposal_scope TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN proposal_terms TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN proposal_valid_until TEXT;
UPDATE leads SET pipeline_stage = CASE WHEN status = 'closed' THEN 'archived' ELSE status END WHERE pipeline_stage IS NULL;
CREATE INDEX idx_leads_pipeline_stage ON leads(pipeline_stage);
CREATE INDEX idx_leads_next_action_date ON leads(next_action_date);
