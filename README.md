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
| `packages/ns-desktop` | Tauri v2 desktop app (NoteSync for macOS + Windows) | :3006 (dev) |
| `packages/ns-mobile` | React Native (Expo) note-taking mobile app | — |
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

## Running Locally

### Prerequisites

- **Node.js 20+** and **npm**
- **PostgreSQL** — required by `fin-api` and `ns-api`. On macOS use Postgres.app or Homebrew; on Windows use the **pgvector Docker container** (see Windows section below — native Postgres on Windows lacks pgvector which `ns-api` requires).
- **Rust** + platform C/C++ toolchain — required only if building/running `ns-desktop`:
  - macOS: Xcode Command Line Tools
  - Windows: MSVC Build Tools 2022 (VC x86/x64 component) + WebView2 Runtime
- **Android Studio + JDK 17** — required only for `ns-mobile` / `fin-mobile` Android builds. iOS builds require macOS + Xcode.

Each API package needs its own `.env` (not checked in). Copy from `.env.example` in each package and fill in secrets. `ns-api` and `fin-api` connect to separate Postgres databases (`notesync` and `finance`).

### Web apps

Portfolio site, `ns-web`, and `fin-web` are all Vite SPAs. Start any of them via turbo filter:

```bash
# Portfolio (port 3000)
npx turbo run dev --filter=@derekentringer/web

# NoteSync web + API (ports 3005 + 3004)
npx turbo run dev --filter=@derekentringer/ns-web --filter=@derekentringer/ns-api

# Finance web + API (ports 3003 + 3002)
npx turbo run dev --filter=@derekentringer/fin-web --filter=@derekentringer/fin-api

# Everything
npx turbo run dev
```

Before starting `ns-api` / `fin-api` the first time, apply Prisma migrations:

```bash
# Run from repo root
npm run db:migrate:deploy --workspace=@derekentringer/ns-api
npm run db:migrate:deploy --workspace=@derekentringer/fin-api
```

> **Windows gotcha:** `prisma migrate deploy` via npm script does not auto-load `.env` on Windows. Run it with an explicit env var instead:
> ```bash
> cd packages/ns-api
> DATABASE_URL="postgresql://derekentringer@localhost:5432/notesync" npx prisma migrate deploy
> ```

### NoteSync Desktop — macOS

```bash
cd packages/ns-desktop
npm run dev              # Local dev with hot reload → talks to local ns-api (localhost:3004)
npm run tauri:build:prod # Production universal binary (ARM + Intel), ad-hoc signed
```

Prod build output: `src-tauri/target/universal-apple-darwin/release/bundle/macos/NoteSync.app`

Requires `packages/ns-desktop/.env` with `VITE_API_URL=http://localhost:3004` for dev mode.

### NoteSync Desktop — Windows

Windows local dev requires Docker Desktop + a pgvector Postgres container (native Windows Postgres cannot easily install pgvector, which `ns-api` depends on).

**One-time setup:**

```bash
# Install Docker Desktop (via winget)
winget install -e --id Docker.DockerDesktop

# Create a persistent pgvector Postgres container matching CLAUDE.md's DATABASE_URL
# (user: derekentringer, trust auth, database: notesync)
docker volume create ns-postgres-data
docker run -d --name ns-postgres --restart unless-stopped -p 5432:5432 \
  -v ns-postgres-data:/var/lib/postgresql/data \
  -e POSTGRES_USER=derekentringer \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_DB=notesync \
  pgvector/pgvector:pg17

# Apply migrations (explicit DATABASE_URL required on Windows)
cd packages/ns-api
DATABASE_URL="postgresql://derekentringer@localhost:5432/notesync" npx prisma migrate deploy
```

Ensure `packages/ns-api/.env` `CORS_ORIGIN` includes `http://tauri.localhost` (the Windows Tauri webview origin).

**Daily dev:**

```bash
# Terminal 1: ns-api + ns-web
npx turbo run dev --filter=@derekentringer/ns-api --filter=@derekentringer/ns-web

# Terminal 2: Tauri dev window with hot reload
cd packages/ns-desktop
npm run dev
```

**Production Windows build (unsigned):**

```bash
cd packages/ns-desktop
npm run tauri:build:prod:win
```

Output: `src-tauri/target/release/bundle/msi/NoteSync_<version>_x64_en-US.msi` and `src-tauri/target/release/bundle/nsis/NoteSync_<version>_x64-setup.exe`. No Windows code-signing cert is configured, so SmartScreen will warn on install — acceptable for personal use.

### NoteSync Mobile (Android)

```bash
cd packages/ns-mobile
npm run start   # Start Expo Metro bundler
# Then in another terminal:
npm run android # Build + install on connected device / emulator
```

Requires Android Studio with an SDK + emulator (or a USB-connected device with developer mode). iOS builds require macOS + Xcode and are not actively maintained (no paid Apple Developer account for push notifications).

Point the app at a local `ns-api` by setting the API URL in the mobile package's env/config — see `packages/ns-mobile/docs/ns/mobile/docs/features/` for setup details.

### Finance Mobile (Android)

```bash
cd packages/fin-mobile
npm run start
npm run android
```

Same prerequisites as NoteSync Mobile.

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
