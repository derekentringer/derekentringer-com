# derekentringer.com

Personal portfolio monorepo. Turborepo workspace with TypeScript across all packages.

> The Finance (`fin-*`) apps were retired and removed in October 2026. The NoteSync (`ns-*`) apps were migrated to Notate ([`PixelPerfect-Studios-LLC/notate`](https://github.com/PixelPerfect-Studios-LLC/notate), `notate.md`) and removed from this repo at the same time. Their code remains available in git history. The migration audit trail lives in `docs/historical/notesync-to-notate-migration/`.

## Packages

| Package | Description | Port |
|---------|-------------|------|
| `packages/web` | React + Vite portfolio site | :3000 |
| `packages/api` | Fastify API server (health-check stub) | :3001 |

## Tech Stack

| Layer | Choice |
|-------|--------|
| Monorepo | Turborepo |
| Language | TypeScript |
| Web Frontend | React + Vite |
| API | Node.js + Fastify |
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

The web frontend uses `serve` for static file serving with SPA fallback.

DNS: GoDaddy (registrar) → Cloudflare (nameservers) → Railway (CNAME). `www.derekentringer.com` redirects to `derekentringer.com` client-side.
