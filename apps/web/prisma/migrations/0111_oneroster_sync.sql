-- Migration 0111: OneRoster 1.2 SIS Integration & Sync History (Stage 5 · C3)
-- Supports automated roster sync from PowerSchool, Infinite Campus, and 1EdTech standard SIS archives.

CREATE TABLE IF NOT EXISTS oneroster_syncs (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL DEFAULT 'CSV_BATCH',
  status TEXT NOT NULL DEFAULT 'PENDING',
  summary TEXT NOT NULL DEFAULT '',
  courses_count INTEGER NOT NULL DEFAULT 0,
  classes_count INTEGER NOT NULL DEFAULT 0,
  users_count INTEGER NOT NULL DEFAULT 0,
  enrollments_count INTEGER NOT NULL DEFAULT 0,
  errors TEXT,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oneroster_syncs_org ON oneroster_syncs(organization_id);
CREATE INDEX IF NOT EXISTS idx_oneroster_syncs_created ON oneroster_syncs(created_at);

CREATE TABLE IF NOT EXISTS oneroster_mappings (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  sourced_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_oneroster_mappings_unique ON oneroster_mappings(organization_id, entity_type, sourced_id);
CREATE INDEX IF NOT EXISTS idx_oneroster_mappings_target ON oneroster_mappings(target_id);
