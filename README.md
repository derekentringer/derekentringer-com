# derekentringer.com

Personal portfolio and tools monorepo. Turborepo workspace with TypeScript across all packages.

## Packages

| Package | Description | Port |
|---------|-------------|------|
| `packages/web` | React + Vite portfolio site | :3000 |
| `packages/api` | Fastify API server (health-check stub) | :3001 |
| `packages/fin-web` | React + Vite personal finance dashboard | :3003 |
| `packages/fin-api` | Fastify API server (finance backend) | :3002 |
| `packages/ns-web` | React + Vite note-taking app (NoteSync) | :3005 |
| `packages/ns-api` | Fastify API server (NoteSync backend) | :3004 |
| `packages/fin-mobile` | React Native (Expo) finance mobile app | — |
| `packages/shared` | Shared TypeScript types and utilities | — |

## Tech Stack

| Layer | Choice |
|-------|--------|
| Monorepo | Turborepo |
| Language | TypeScript |
| Web Frontends | React + Vite |
| APIs | Node.js + Fastify |
| Database | PostgreSQL |
| ORM | Prisma |
| Mobile | React Native (Expo) |
| Auth | JWT + bcrypt + TOTP 2FA |
| Hosting | Railway |

## Development

```bash
npm install          # Install all workspace dependencies
npx turbo run dev    # Start all dev servers
npx turbo run build  # Build all packages
npx turbo run type-check  # Type-check all packages
npx turbo run test   # Run all test suites
```

## Git Workflow

Uses gitflow: `feature/*` → `develop` → `main`. Releases are tagged on `main`.

## Deployment

Railway auto-deploys from `main` using Railpack.

| Service | Domain | Start Command |
|---------|--------|---------------|
| web | derekentringer.com | `npm run start --workspace=@derekentringer/web` |
| fin-web | fin.derekentringer.com | `npm run start --workspace=@derekentringer/fin-web` |
| fin-api | fin-api.derekentringer.com | `npm run db:migrate:deploy && npm run start` (workspace: fin-api) |
| ns-web | ns.derekentringer.com | `npm run start --workspace=@derekentringer/ns-web` |
| ns-api | ns-api.derekentringer.com | `npm run db:migrate:deploy && npm run start` (workspace: ns-api) |

Web frontends use `serve` for static file serving with SPA fallback. API servers run Fastify on `0.0.0.0:$PORT`.

DNS: GoDaddy (registrar) → Cloudflare (nameservers) → Railway (CNAME). `www.derekentringer.com` redirects to `derekentringer.com` client-side.
