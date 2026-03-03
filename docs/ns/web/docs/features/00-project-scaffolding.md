# 00 — Project Scaffolding

**Status:** Complete
**Phase:** 1 — Foundation
**Priority:** High
**Completed:** v1.30.0

## Summary

Set up the React + Vite web frontend (`ns-web`), Fastify API backend (`ns-api`), PostgreSQL database with Prisma, shared NoteSync types, and Railway deployment configuration.

## What Was Implemented

### NoteSync API (`packages/ns-api/`)
- Fastify server on port 3004 (matching fin-api patterns)
- Prisma ORM with PostgreSQL via `@prisma/adapter-pg`
- Database schema: `Note` (with soft deletes, tags JSON, folder, summary), `SyncCursor`, `RefreshToken`
- `GET /health` endpoint
- Fastify plugins: CORS, Helmet, Rate Limit (200 req/min), Cookie
- Auth plugin from `@derekentringer/shared`
- Global error handler (4xx/5xx formatting)
- Periodic refresh token cleanup (1-hour interval)
- `GET /robots.txt` — blocks all crawlers
- Dockerfile for Railway deployment (multi-stage Node 20 Alpine)
- App factory with `disableRateLimit` option for testing
- Config loader with production secret enforcement

### NoteSync Web (`packages/ns-web/`)
- React + Vite SPA on port 3005
- Tailwind CSS v4 with dark theme and lime-yellow accent (#d4e157)
- React Router with client-side routing
- API client (`apiFetch`) with Bearer token injection, 401 refresh retry, auth failure callback
- Basic app shell with sidebar + main content area
- Production: `serve dist -s` with SPA fallback
- `VITE_API_URL` env var (build-time, defaults to `http://localhost:3004`)
- `<meta name="robots" content="noindex, nofollow" />` defense-in-depth
- `robots.txt` blocking all crawlers and AI agents

### Shared Types (`packages/shared/src/ns/`)
- `Note`, `CreateNoteRequest`, `UpdateNoteRequest`, `NoteListResponse`
- `SyncChange`, `SyncCursor`, `SyncPushRequest`, `SyncPullResponse`
- Exported via `@derekentringer/shared/ns` subpath

### Test Infrastructure
- Vitest test suites for both packages (81 total tests)
- `ns-api`: 6 test files (61 tests) — health, config, mappers, noteStore, auth routes, note routes
- `ns-web`: 3 test files (20 tests) — App routing, notes API module, NotesPage component
- Mock Prisma helper following fin-api pattern
- `npx turbo run test` includes both packages in CI

### Monorepo Integration
- Both packages added to Turborepo pipelines (dev, build, type-check, test)
- Shared `tsconfig.base.json`
- Dev ports: ns-api on 3004, ns-web on 3005 (no conflicts with fin-api 3002 / fin-web 3003)

## Resolved Open Questions

- **Railway project**: Same Railway project as fin (separate services)
- **Database**: Completely separate PostgreSQL instance from finance
- **Port numbers**: ns-api on 3004, ns-web on 3005
- **Credentials**: Reuses same `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` env var pattern (can share or use different values)
