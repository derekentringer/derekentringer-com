CREATE TABLE IF NOT EXISTS note_links (
  id TEXT PRIMARY KEY,
  source_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  target_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  link_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_note_id, target_note_id, link_text)
);
CREATE INDEX IF NOT EXISTS idx_note_links_source ON note_links(source_note_id);
CREATE INDEX IF NOT EXISTS idx_note_links_target ON note_links(target_note_id);
