# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal portfolio and tools monorepo for Derek Entringer (derekentringer.com). Turborepo workspace with React + Vite web app, Fastify API, finance tools, and shared packages.

The `ns-*` NoteSync packages (`ns-api`, `ns-web`, `ns-desktop`, `ns-mobile`) were migrated out of this repo on 2026-05-12 and now live in [`PixelPerfect-Studios-LLC/notate`](https://github.com/PixelPerfect-Studios-LLC/notate) under the `notate.md` domain. They remain checked in here as an audit/reference snapshot but receive no further development, releases, or deploys — see `packages/ns-*/ARCHIVED.md` and `docs/historical/notesync-to-notate-migration/` for details.

## Development

```bash
npm install          # Install all workspace dependencies
npx turbo run dev    # Start all dev servers (web :3000, api :3001, fin-api :3002, fin-web :3003)
npx turbo run build  # Build all packages
npx turbo run type-check  # Type-check all packages
```

**Dev server port notes**: When running `npx turbo run dev`, the `api` package (health-check stub on :3001) often fails with `EADDRINUSE` because it races with other turbo tasks for ports. This is not a problem — the `api` package is just a health-check stub and isn't needed for finance feature development. The important services are `fin-api` (Fastify on :3002) and `fin-web` (Vite on :3003). Vite auto-increments ports when collisions occur, so check the turbo output for actual port numbers. Before starting dev servers, always kill old processes first: `pkill -9 -f "vite|tsx watch|turbo"` then `lsof -ti :3000,:3001,:3002,:3003 | xargs kill -9`. CORS on fin-api defaults to `http://localhost:3003`, so fin-web **must** be on port 3003 for login to work. If it lands on another port, sign-in will fail with CORS errors.

## Git Workflow

This project uses **gitflow**:

- `main` — production releases, auto-deployed to Railway
- `develop` — integration branch
- `feature/*` — feature branches off `develop`
- All changes go through PRs: `feature/*` → `develop` → `main`
- Tag releases on `main` (e.g., `v1.0.5`)

## Deployment

- **Platform**: Railway (Railpack builder, not Docker)
- **Web**: Railpack auto-detects Node workspace; start command is `npm run start --workspace=@derekentringer/web` (configured in Railway dashboard)
- **Web production server**: `serve` static file server bound to `0.0.0.0:$PORT` with SPA fallback (`-s` flag)
- **API**: `packages/api/Dockerfile` — multi-stage Node build on port 3001
- **Finance Web**: Railpack; start command `npm run start --workspace=@derekentringer/fin-web`; `serve` static file server with SPA fallback; custom domain `fin.derekentringer.com`; env: `VITE_API_URL=https://fin-api.derekentringer.com` (build-time)
- **Finance API**: Railpack; start command `npm run db:migrate:deploy --workspace=@derekentringer/fin-api && npm run start --workspace=@derekentringer/fin-api`; Fastify on `0.0.0.0:$PORT`; custom domain `fin-api.derekentringer.com`; env: `NODE_ENV`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `CORS_ORIGIN=https://fin.derekentringer.com`, `DATABASE_URL` (from Railway Postgres plugin), `ENCRYPTION_KEY` (64-char hex), `RESEND_API_KEY` (password reset emails), `APP_URL=https://fin.derekentringer.com` (frontend URL for email links)
- **CI**: GitHub Actions (`.github/workflows/ci.yml`) — type-check + build on PRs and pushes to main
- **DNS**: GoDaddy (registrar) → Cloudflare (nameservers) → Railway (CNAME)
- **www redirect**: Client-side redirect in `App.tsx` from `www.derekentringer.com` → `derekentringer.com`

Note: Railway skips Dockerfiles not at the repo root. The web Dockerfile exists for local Docker testing but Railway uses Railpack in production. Do not set watch paths on Railway services — cross-package dependencies (e.g., shared → fin-api) cause deploys to be silently skipped when changes land outside the watched paths.

The old `ns-web`, `ns-api` Railway services still exist as of 2026-05-13 and are slated for deletion after the 30-day post-cutover stability window (~2026-06-11) per Phase 10 §C of the migration plan.

## Architecture

```
packages/
  web/          — React + Vite + React Router SPA (portfolio site)
  api/          — Fastify API server (health-check stub)
  fin-web/      — React + Vite SPA (personal finance dashboard)
  fin-api/      — Fastify API server (personal finance backend)
  fin-mobile/   — React Native app (Finance for Android/iOS)
  shared/       — Shared TypeScript types and utilities
  ns-web/       — [ARCHIVED — see notate repo] NoteSync web frontend
  ns-api/       — [ARCHIVED — see notate repo] NoteSync API
  ns-desktop/   — [ARCHIVED — see notate repo] NoteSync desktop (Tauri)
  ns-mobile/    — [ARCHIVED — see notate repo] NoteSync mobile (Expo)
```

### Web (`packages/web/`)

- `src/App.tsx` — Routes + www redirect + analytics tracking
- `src/pages/PortfolioPage.tsx` — Main landing page (centered name/title/link)
- `src/pages/PrivacyPage.tsx` — Privacy policy
- `src/pages/NotFoundPage.tsx` — 404 page
- `src/styles/global.css` — Dark theme base styles
- `src/utils/analytics.ts` — Google Analytics pageview tracking
- `src/utils/useDocumentHead.ts` — Lightweight document head management (title, meta, link tags)
- CSS Modules (`*.module.css`) for component-scoped styles
- `public/robots.txt` — Allows only homepage indexing, blocks all other paths

### API (`packages/api/`)

- `src/index.ts` — Fastify server with `GET /health` endpoint

### Finance Web (`packages/fin-web/`)

- React + Vite SPA for personal finance dashboard
- **Feature docs**: `docs/fin/web/docs/features/` (00–16), progress tracker at `docs/fin/web/docs/PROGRESS.md`
- **Feature planning docs**: `docs/fin/web/docs/feature_planning/` for planned/in-progress features
- `src/App.tsx` — Routes + auth-gated layout
- `src/pages/LoginPage.tsx` — Login form with email/password and TOTP 2FA support
- `src/context/AuthContext.tsx` — JWT auth state management with multi-user support
- `src/components/FinLogo.tsx` — Inline SVG logo component (two-peaks icon)
- `src/components/Sidebar.tsx` — Navigation sidebar with logo in header (expanded + collapsed)
- `src/components/Header.tsx` — Top header with logo on mobile
- `public/` — Favicon (ICO + PNG), apple-touch-icon, Android Chrome icons, `site.webmanifest`, `logo.svg`
- `public/robots.txt` — Blocks all crawlers and AI agents (blanket `Disallow: /` plus explicit AI bot rules)
- `index.html` includes `<meta name="robots" content="noindex, nofollow" />` as defense-in-depth
- API URL configured via `VITE_API_URL` env var (build-time)
- Production domain: `fin.derekentringer.com`

### Finance API (`packages/fin-api/`)

- Fastify server with JWT auth (access + refresh tokens), multi-user with TOTP 2FA
- `src/index.ts` — Server entry, CORS via `CORS_ORIGIN` env var
- `src/routes/auth.ts` — Login, register, refresh, logout, password reset/change endpoints
- `src/routes/admin.ts` — Admin panel routes (user management, approved emails, AI toggle)
- `src/routes/totp.ts` — TOTP 2FA setup, verify, disable endpoints
- `GET /robots.txt` — Blocks all crawlers (blanket `Disallow: /`)
- `src/plugins/auth.ts` — JWT verification, cookie handling
- Database-backed users with bcrypt password hashing and per-user data isolation
- Production domain: `fin-api.derekentringer.com`
- **Database**: PostgreSQL via Prisma ORM (v7)
  - `prisma/schema.prisma` — Database schema (User, RefreshToken, Account, Transaction, Balance, Setting, PasswordResetToken)
  - `prisma.config.ts` — Prisma CLI config (datasource URL, migrations path)
  - `src/generated/prisma/` — Generated Prisma client (gitignored)
  - `src/lib/prisma.ts` — PrismaClient singleton with `@prisma/adapter-pg` (SSL without certificate verification in production — Railway Postgres does not support verified SSL)
  - `src/lib/encryption.ts` — AES-256-GCM field-level encryption (wraps shared crypto)
  - `src/lib/mappers.ts` — Prisma row ↔ API type mappers with encrypt/decrypt
- **Prisma commands** (run from `packages/fin-api/`):
  - `npm run db:migrate:dev` — Create/apply dev migration
  - `npm run db:migrate:deploy` — Apply migrations in production
  - `npm run db:seed` — Run seed script
  - `npm run db:studio` — Open Prisma Studio
- **Local database**: `prisma migrate dev` does not work locally (access denied). Run migration SQL manually instead: `psql "postgresql://derekentringer@localhost:5432/finance" -c '<SQL>'`. Production migrations are applied automatically via the Railway start command.
- `src/config.ts` — App config with secret enforcement (all secrets required outside `development`/`test` environments)
- **Env vars**: `DATABASE_URL` (PostgreSQL connection string), `ENCRYPTION_KEY` (64-char hex, 32 bytes for AES-256-GCM), `RESEND_API_KEY` (password reset emails), `APP_URL` (frontend URL for email links, defaults to `http://localhost:3003`)
- **Railway start command**: `npm run db:migrate:deploy --workspace=@derekentringer/fin-api && npm run start --workspace=@derekentringer/fin-api`

### Finance Mobile (`packages/fin-mobile/`)

- React Native + Expo app for Finance on Android/iOS
- **Feature docs**: `docs/fin/mobile/docs/features/` (00–09), progress tracker at `docs/fin/mobile/docs/PROGRESS.md`
- **Feature planning docs**: `docs/fin/mobile/docs/feature_planning/` for planned/in-progress features
- 5 bottom tabs: Dashboard, Accounts, Activity, Planning, More
- Dark mode only
- Push notifications via Firebase Cloud Messaging (Android only)

### Archived: NoteSync packages (`packages/ns-*/`)

These four packages — `ns-api`, `ns-web`, `ns-desktop`, `ns-mobile` — were the NoteSync product before it was rebranded to **Notate** and migrated out of this repo on 2026-05-12. Active development, releases, and deployments all live in [`PixelPerfect-Studios-LLC/notate`](https://github.com/PixelPerfect-Studios-LLC/notate) (production: `notate.md`). The code remains here only as a historical snapshot.

- Do **not** modify these packages here. Submit any NoteSync/Notate work as PRs against the `notate` repo.
- Do **not** propose releases, tags, deploys, or feature work for these packages on this repo.
- The migration plan, decisions, and audit trail live in `docs/historical/notesync-to-notate-migration/`.
- The old Railway services + Cloudflare DNS records will be torn down after the 30-day stability window per Phase 10 §§C–F (~2026-06-11).

## External Services

- Google Analytics (UA-561217-2) via gtag in `packages/web/index.html`
- Google Fonts (Roboto) loaded via Google Fonts CDN

## Design Assets

- `designs/derekentringer-com/` — PSD source files for portfolio site logos
- `designs/fin-app/fin_logo/` — Finance app logo (original + clean 512px PNG)
