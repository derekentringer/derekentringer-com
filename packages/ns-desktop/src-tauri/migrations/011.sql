CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT NOT NULL,
  r2_url TEXT NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  ai_description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  sync_status TEXT NOT NULL DEFAULT 'synced',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_images_note_id ON images(note_id);
CREATE INDEX IF NOT EXISTS idx_images_updated_at ON images(updated_at);
