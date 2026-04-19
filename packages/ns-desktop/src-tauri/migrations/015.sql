-- Managed directories for recursive file watching.
-- When a user imports a folder with "Keep Local," the path is registered here.
-- The directory watcher monitors these paths for new/changed/deleted files.

CREATE TABLE IF NOT EXISTS managed_directories (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  root_folder_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
