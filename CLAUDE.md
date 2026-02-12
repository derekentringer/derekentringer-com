# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal portfolio and tools monorepo for Derek Entringer (derekentringer.com). Turborepo workspace with React + Vite web app, Fastify API, and shared packages.

## Development

```bash
npm install          # Install all workspace dependencies
npx turbo run dev    # Start all dev servers (web on :3000, api on :3001)
npx turbo run build  # Build all packages
npx turbo run type-check  # Type-check all packages
```

## Deployment

- **Platform**: Railway (Docker-based)
- **Web**: `packages/web/Dockerfile` — multi-stage build → nginx on port 8080
- **API**: `packages/api/Dockerfile` — multi-stage build → Node on port 3001
- **CI**: GitHub Actions (`.github/workflows/ci.yml`) — type-check + build on PRs

## Architecture

```
packages/
  web/      — React + Vite + React Router SPA (portfolio site)
  api/      — Fastify API server (health-check stub, future personal finance API)
  shared/   — Shared TypeScript types and utilities
  mobile/   — React Native app (deferred to Phase 6)
```

### Web (`packages/web/`)

- `src/pages/PortfolioPage.tsx` — Main landing page (centered name/title/link)
- `src/pages/PrivacyPage.tsx` — Privacy policy
- `src/pages/NotFoundPage.tsx` — 404 page
- `src/styles/global.css` — Dark theme base styles
- `src/utils/analytics.ts` — Google Analytics pageview tracking
- CSS Modules (`*.module.css`) for component-scoped styles

### API (`packages/api/`)

- `src/index.ts` — Fastify server with `GET /health` endpoint

## External Services

- Google Analytics (UA-561217-2) via gtag in `packages/web/index.html`
- Google Fonts (Roboto) loaded via Google Fonts CDN

## Design Assets

- `design-assets/` — PSD source files for logos (not part of the build)
