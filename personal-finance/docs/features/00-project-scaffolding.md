# 00 — Project Scaffolding

**Status:** Complete
**Phase:** 1 — Foundation
**Priority:** High
**Completed:** v1.1.0

## Summary

Set up the Turborepo monorepo with initial packages for API, web, mobile, and shared code. Configure Railway deployment. Establish TypeScript configs, linting, and dev tooling.

## What Was Implemented

- Turborepo monorepo with `packages/*` workspace structure
- Package structure: `api/`, `web/`, `finance-api/`, `finance-web/`, `shared/`, `mobile/` (deferred)
- `turbo.json` with build/dev/lint/type-check/test pipelines
- Shared `tsconfig.base.json` (ES2022, ESNext modules, strict mode)
- ESLint 9 flat config with TypeScript support
- Prettier for code formatting
- Vitest test infrastructure across all packages
- `packages/shared/` with TypeScript types (auth, API, finance), crypto utilities (AES-256-GCM)
- `packages/finance-api/` — Fastify server with `GET /health` endpoint
- `packages/finance-web/` — React + Vite SPA with dashboard placeholder and 404 page
- Railway deployment: Railpack for web, Dockerfile for finance-api
- GitHub Actions CI (`.github/workflows/ci.yml`) — type-check + build on PRs

## Resolved Open Questions

- **Mobile package**: Scaffolded as a placeholder, deferred to Phase 6
- **Railway configuration**: Single project with multiple services
- **Portfolio site**: Stays on Railway via the existing `packages/web/` package
