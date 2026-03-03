# 04 — Google Drive Import

**Status:** Not Started
**Phase:** 4 — External Sources & Sync
**Priority:** Medium

## Summary

One-time import of `.txt` files from Google Drive into the local SQLite database. User authenticates with Google, browses their Drive, selects a folder, and imports files as notes.

## Requirements

- **Google OAuth flow**:
  - "Connect Google Drive" button in settings or import wizard
  - OAuth 2.0 consent screen via Google Cloud project
  - Open system browser for auth (Tauri can handle the redirect URI)
  - Store OAuth tokens securely (Tauri's secure storage or encrypted in SQLite)
  - Ability to disconnect/revoke access
- **Folder browser**:
  - After auth, display the user's Google Drive folder structure
  - Navigate folders, see file names and sizes
  - Filter to show only `.txt` files
  - Select a folder to import all `.txt` files within it (optionally recursive)
- **Import behavior**:
  - Same as local .txt import:
    - File name (without extension) becomes note title
    - File content becomes note body (markdown)
    - Drive folder structure maps to NoteSync folders
    - Preserve file creation/modification dates
  - Generate UUID for each imported note
  - Set `syncStatus` to `pending`
- **Preview & selection**:
  - Preview list of files to import (same UI pattern as local .txt import)
  - Select/deselect individual files
  - "Import Selected" button
- **Progress & results**:
  - Progress bar during download + import
  - Summary: "Imported X notes from Google Drive"
  - Error handling: skip files that fail to download, report at the end

## Technical Considerations

- Google Drive API v3 via REST (no SDK needed; use `fetch` or `reqwest` in Rust)
- Scopes needed: `https://www.googleapis.com/auth/drive.readonly` (read-only access)
- OAuth redirect: Tauri can register a custom URI scheme (`notesync://auth/callback`) or use localhost redirect
- File download: `GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media`
- Folder listing: `GET https://www.googleapis.com/drive/v3/files?q='folderId'+in+parents`
- Rate limiting: Google Drive API has a 20,000 queries/100 seconds limit (more than enough for one-time import)
- Token refresh: handle expired access tokens by using the refresh token
- This is a one-time operation — after import, Google Drive is not synced or monitored

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — needs Tauri app shell and SQLite database
- [01 — .txt Import](01-txt-import.md) — shares the same import UI pattern and SQLite insert logic

## Open Questions

- Should Google Drive import support formats beyond `.txt` (e.g., Google Docs exported as plain text)?
- Should the OAuth tokens persist for future re-imports, or be discarded after each import session?
- Handle `.md` files from Google Drive as well?
