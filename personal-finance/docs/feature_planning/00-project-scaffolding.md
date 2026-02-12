# 00 — Project Scaffolding

**Status:** Not Started
**Phase:** 1 — Foundation
**Priority:** High

## Summary

Set up the Turborepo monorepo with initial packages for API, web, mobile, and shared code. Configure Railway deployment. Establish TypeScript configs, linting, and dev tooling.

## Requirements

- Initialize Turborepo monorepo at `personal-finance/`
- Create package structure:
  ```
  packages/
    api/          # Node.js + Fastify backend
    web/          # React + Vite frontend
    mobile/       # React Native (Android-focused)
    shared/       # TypeScript types, validation schemas, utilities
  ```
- Configure `turbo.json` for build/dev/lint pipelines across packages
- Set up TypeScript with shared `tsconfig.base.json` and per-package overrides
- Configure ESLint and Prettier (shared config)
- Add Railway deployment configs (`railway.toml` or `Procfile` as needed)
- Set up environment variable structure (`.env.example` files)
- Basic health-check endpoint on the API (`GET /health`)
- Basic React app shell on the web frontend
- Ensure the existing static portfolio site (`index.html`, `privacy.html`, `css/`, `img/`) is unaffected

## Technical Considerations

- Turborepo handles task orchestration and caching across packages
- `packages/shared/` exports TypeScript types consumed by API, web, and mobile
- Railway supports monorepo deployments — each service points to its package root
- Vite dev server for web, `tsx` or `ts-node` for API dev mode
- React Native init for mobile can be deferred until Phase 6

## Dependencies

None — this is the first feature.

## Open Questions

- Should the mobile package be scaffolded now or deferred to Phase 6?
- Exact Railway project/service configuration (single project with multiple services vs. separate projects)?
- Does the existing portfolio site stay on GitHub Pages or move to Railway?
