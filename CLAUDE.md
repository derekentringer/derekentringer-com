# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal portfolio monorepo for Derek Entringer (derekentringer.com). Turborepo workspace with a React + Vite web app and a Fastify API stub.

The Finance (`fin-*`) apps were retired and deleted in October 2026. The NoteSync (`ns-*`) apps moved to [`PixelPerfect-Studios-LLC/notate`](https://github.com/PixelPerfect-Studios-LLC/notate) (`notate.md`) and were removed from this repo at the same time. Do not reintroduce either here. Their code survives only in git history. The migration audit trail lives in `docs/historical/notesync-to-notate-migration/`.

## Development

```bash
npm install          # Install all workspace dependencies
npx turbo run dev    # Start all dev servers (web :3000, api :3001)
npx turbo run build  # Build all packages
npx turbo run type-check  # Type-check all packages
```

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
- **CI**: GitHub Actions (`.github/workflows/ci.yml`) — type-check + build on PRs and pushes to main
- **DNS**: GoDaddy (registrar) → Cloudflare (nameservers) → Railway (CNAME)
- **www redirect**: Client-side redirect in `App.tsx` from `www.derekentringer.com` → `derekentringer.com`

Note: Railway skips Dockerfiles not at the repo root. The web Dockerfile exists for local Docker testing but Railway uses Railpack in production.

## Architecture

```
packages/
  web/          — React + Vite + React Router SPA (portfolio site)
  api/          — Fastify API server (health-check stub)
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

## External Services

- Google Analytics (UA-561217-2) via gtag in `packages/web/index.html`
- Google Fonts (Roboto) loaded via Google Fonts CDN

## Design Assets

- `designs/derekentringer-com/` — PSD source files for portfolio site logos
