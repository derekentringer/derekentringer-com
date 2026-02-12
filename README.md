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

## Deployment

Docker-based deployment via Railway. Each package has its own `Dockerfile`.
