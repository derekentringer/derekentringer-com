# 00 — Project Scaffolding

**Status:** Not Started
**Phase:** 1 — Foundation
**Priority:** High

## Summary

Set up the React + Vite web frontend (`notesync-web`), Fastify API backend (`notesync-api`), PostgreSQL database with Prisma, and Railway deployment. Establish the domain at `notesync.derekentringer.com`.

## Requirements

- **notesync-api** (`packages/notesync-api/`):
  - Node.js + Fastify backend (same pattern as finance-api)
  - Prisma ORM with PostgreSQL
  - PostgreSQL schema for notes:
    ```prisma
    model Note {
      id        String    @id @default(uuid())
      title     String
      content   String    // raw markdown
      folder    String?
      tags      Json      @default("[]")  // string array
      summary   String?   // AI-generated summary
      embedding Unsupported("vector(1536)")?  // pgvector
      createdAt DateTime  @default(now())
      updatedAt DateTime  @updatedAt
      deletedAt DateTime? // soft delete
    }

    model SyncCursor {
      deviceId     String   @id
      lastSyncedAt DateTime
    }
    ```
  - Health check endpoint: `GET /health`
  - Fastify plugins: CORS, Helmet, Rate Limit, Cookie (matching finance-api)
  - Register auth plugin from `@derekentringer/shared`
  - Docker multi-stage build (matching finance-api Dockerfile pattern)
  - Environment variables: `DATABASE_URL`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `CORS_ORIGIN`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ANTHROPIC_API_KEY`
- **notesync-web** (`packages/notesync-web/`):
  - React + Vite (matching finance-web)
  - Tailwind CSS for styling
  - React Router for client-side routing
  - API client with token refresh (matching finance-web `client.ts` pattern)
  - Basic app shell: sidebar + main content area
  - Production: `serve dist -s -l tcp://0.0.0.0:${PORT}`
  - Environment variable: `VITE_API_URL`
- **Shared types** (`packages/notesync-shared/` or extend `@derekentringer/shared`):
  - Note types: `Note`, `CreateNoteRequest`, `UpdateNoteRequest`, `NoteListResponse`
  - Sync types: `SyncPushRequest`, `SyncPullResponse`, `SyncChange`
  - API response types (reuse existing `ApiResponse`, `ApiError`)
- **Railway deployment**:
  - notesync-api as a Node.js service (Docker)
  - notesync-web as a static service (serve)
  - PostgreSQL via Railway plugin (separate from finance DB)
  - Custom domain: `notesync.derekentringer.com` (web), `notesync-api.derekentringer.com` (API)
- **Monorepo integration**:
  - Add packages to `turbo.json` pipelines
  - Shared `tsconfig.base.json`
  - ESLint and Prettier (shared config)
- **pgvector extension**:
  - Enable `pgvector` extension in PostgreSQL for future semantic search
  - `CREATE EXTENSION IF NOT EXISTS vector;`

## Technical Considerations

- notesync-api and finance-api are separate Fastify services with separate databases — they share auth patterns but not data
- Railway supports multiple services per project — NoteSync services can live in the same Railway project as fin, or in a separate project
- Prisma generate runs at build time; generated client is not committed to git
- The web app is a SPA (single-page app) — `serve -s` handles client-side routing fallback
- CORS: allow `notesync.derekentringer.com` and `localhost:3003` (dev)
- Rate limiting: 200 requests/minute globally, 5 logins/15 minutes (matching finance-api)

## Dependencies

None — this is the first feature.

## Open Questions

- Same Railway project as fin, or separate? (Separate keeps billing/resources isolated)
- Should notesync-api and finance-api share the same PostgreSQL instance (separate schemas) or completely separate databases?
- Port numbers: notesync-api on 3004, notesync-web on 3005 (to avoid conflicts with finance-api 3002 and finance-web 3003 during local dev)?
