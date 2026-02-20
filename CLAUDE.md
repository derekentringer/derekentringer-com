# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal portfolio and tools monorepo for Derek Entringer (derekentringer.com). Turborepo workspace with React + Vite web app, Fastify API, and shared packages.

## Development

```bash
npm install          # Install all workspace dependencies
npx turbo run dev    # Start all dev servers (web :3000, api :3001, finance-api :3002, finance-web :3003)
npx turbo run build  # Build all packages
npx turbo run type-check  # Type-check all packages
```

**Dev server port notes**: When running `npx turbo run dev`, the `api` package (health-check stub on :3001) often fails with `EADDRINUSE` because it races with other turbo tasks for ports. This is not a problem — the `api` package is just a health-check stub and isn't needed for finance feature development. The important services are `finance-api` (Fastify on :3002) and `finance-web` (Vite on :3003). Vite auto-increments ports when collisions occur, so check the turbo output for actual port numbers. Before starting dev servers, always kill old processes first: `pkill -9 -f "vite|tsx watch|turbo"` then `lsof -ti :3000,:3001,:3002,:3003 | xargs kill -9`. CORS on finance-api defaults to `http://localhost:3003`, so finance-web **must** be on port 3003 for login to work — if it lands on another port, sign-in will fail with CORS errors.

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
- **Finance Web**: Railpack; start command `npm run start --workspace=@derekentringer/finance-web`; `serve` static file server with SPA fallback; custom domain `fin.derekentringer.com`; env: `VITE_API_URL=https://fin-api.derekentringer.com` (build-time)
- **Finance API**: Railpack; start command `npm run db:migrate:deploy --workspace=@derekentringer/finance-api && npm run start --workspace=@derekentringer/finance-api`; Fastify on `0.0.0.0:$PORT`; custom domain `fin-api.derekentringer.com`; env: `NODE_ENV`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `PIN_HASH`, `CORS_ORIGIN=https://fin.derekentringer.com`, `DATABASE_URL` (from Railway Postgres plugin), `ENCRYPTION_KEY` (64-char hex)
- **CI**: GitHub Actions (`.github/workflows/ci.yml`) — type-check + build on PRs and pushes to main
- **DNS**: GoDaddy (registrar) → Cloudflare (nameservers) → Railway (CNAME)
- **www redirect**: Client-side redirect in `App.tsx` from `www.derekentringer.com` → `derekentringer.com`

Note: Railway skips Dockerfiles not at the repo root. The web Dockerfile exists for local Docker testing but Railway uses Railpack in production. Do not set watch paths on Railway services — cross-package dependencies (e.g., shared → finance-api) cause deploys to be silently skipped when changes land outside the watched paths.

## Architecture

```
packages/
  web/          — React + Vite + React Router SPA (portfolio site)
  api/          — Fastify API server (health-check stub)
  finance-web/  — React + Vite SPA (personal finance dashboard)
  finance-api/  — Fastify API server (personal finance backend)
  shared/       — Shared TypeScript types and utilities
  mobile/       — React Native app (deferred to Phase 6)
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

### Finance Web (`packages/finance-web/`)

- React + Vite SPA for personal finance dashboard
- `src/App.tsx` — Routes + auth-gated layout
- `src/pages/LoginPage.tsx` — Login form with PIN support
- `src/contexts/AuthContext.tsx` — JWT auth state management
- API URL configured via `VITE_API_URL` env var (build-time)
- Production domain: `fin.derekentringer.com`

### Finance API (`packages/finance-api/`)

- Fastify server with JWT auth (access + refresh tokens)
- `src/index.ts` — Server entry, CORS via `CORS_ORIGIN` env var
- `src/routes/auth.ts` — Login, refresh, logout endpoints
- `src/plugins/auth.ts` — JWT verification, cookie handling
- Passwords/PINs verified via bcrypt hashes from env vars
- Production domain: `fin-api.derekentringer.com`
- **Database**: PostgreSQL via Prisma ORM (v7)
  - `prisma/schema.prisma` — Database schema (RefreshToken, Account, Transaction, Balance)
  - `prisma.config.ts` — Prisma CLI config (datasource URL, migrations path)
  - `src/generated/prisma/` — Generated Prisma client (gitignored)
  - `src/lib/prisma.ts` — PrismaClient singleton with `@prisma/adapter-pg`
  - `src/lib/encryption.ts` — AES-256-GCM field-level encryption (wraps shared crypto)
  - `src/lib/mappers.ts` — Prisma row ↔ API type mappers with encrypt/decrypt
- **Prisma commands** (run from `packages/finance-api/`):
  - `npm run db:migrate:dev` — Create/apply dev migration
  - `npm run db:migrate:deploy` — Apply migrations in production
  - `npm run db:seed` — Run seed script
  - `npm run db:studio` — Open Prisma Studio
- **Local database**: `prisma migrate dev` does not work locally (access denied). Run migration SQL manually instead: `psql "postgresql://derekentringer@localhost:5432/finance" -c '<SQL>'`. Production migrations are applied automatically via the Railway start command.
- **Env vars**: `DATABASE_URL` (PostgreSQL connection string), `ENCRYPTION_KEY` (64-char hex, 32 bytes for AES-256-GCM)
- **Railway start command**: `npm run db:migrate:deploy --workspace=@derekentringer/finance-api && npm run start --workspace=@derekentringer/finance-api`

## External Services

- Google Analytics (UA-561217-2) via gtag in `packages/web/index.html`
- Google Fonts (Roboto) loaded via Google Fonts CDN

## Design Assets

- `design-assets/` — PSD source files for logos (not part of the build)
