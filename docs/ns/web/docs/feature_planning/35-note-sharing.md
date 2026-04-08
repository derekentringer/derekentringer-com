# 35 — Note Sharing via Public Links

**Status:** Planned
**Phase:** Phase 2 — Paid Tier Foundation
**Priority:** Medium

## Summary

Share a note via a public URL. The recipient sees a read-only rendered markdown page — no account required. Useful for sharing meeting notes, documentation, blog drafts.

## User Flow

1. User clicks "Share" button on a note (toolbar or command palette)
2. Modal shows share options:
   - Toggle "Enable public link" on/off
   - Copy link button
   - Optional: set expiration (24h, 7d, 30d, never)
   - Optional: password protection
3. Public URL format: `https://newname.com/share/{shareId}`
4. Shared page renders markdown with the same preview styles as the app
5. No editing, no account required, no app chrome — just the content

## Implementation

### API

- `POST /notes/:id/share` — create or update share settings, returns `shareId`
- `DELETE /notes/:id/share` — revoke share
- `GET /share/:shareId` — public endpoint (no auth), returns rendered note content
- Database: `NoteShare` table (noteId, shareId, expiresAt, passwordHash, createdAt)

### Web

- `src/pages/SharedNotePage.tsx` — public page, no auth wrapper, renders markdown
- Minimal layout: note title, content, "Made with [Product Name]" footer (free marketing)
- Open Graph meta tags for social preview (title, first 200 chars of content)

### Tier Limits

- Free: no sharing
- Personal: 5 active shared notes
- Pro: unlimited

## Verification

- Sharing creates a public URL that works in incognito
- Revoking share returns 404 on the URL
- Expiration works (link stops working after set time)
- Password protection prompts for password before showing content
- Shared page renders markdown correctly (images, code blocks, tables)
- OG meta tags show preview when pasting link in Slack/Twitter
