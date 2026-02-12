# derekentringer.com

Personal portfolio and tools monorepo.

## Packages

| Package | Description |
|---------|-------------|
| `packages/web` | React + Vite portfolio site |
| `packages/api` | Fastify API server |
| `packages/shared` | Shared TypeScript types |
| `packages/mobile` | React Native app (deferred) |

## Development

```bash
npm install
npx turbo run dev
```

Web app runs at `http://localhost:3000`, API at `http://localhost:3001`.

## Build

```bash
npx turbo run build
```

## Git Workflow

Uses gitflow: `feature/*` → `develop` → `main`. Releases are tagged on `main`.

## Deployment

Railway auto-deploys from `main` using Railpack. The web service start command is configured in Railway's dashboard as `npm run start --workspace=@derekentringer/web`.

DNS: GoDaddy (registrar) → Cloudflare (nameservers) → Railway (CNAME). `www.derekentringer.com` redirects to `derekentringer.com` client-side.
