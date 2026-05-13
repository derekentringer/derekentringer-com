# NoteSync → Notate Migration

> **🔷 Migration complete — cutover 2026-05-12, doc finalization 2026-05-13.**
>
> Phases 0–9 shipped. Production NoteSync now runs at `notate.md` (PixelPerfect Studios LLC) out of the [`PixelPerfect-Studios-LLC/notate`](https://github.com/PixelPerfect-Studios-LLC/notate) repo. Phase 10 (post-migration cleanup) is partially done: §G doc finalization complete; §§A–F old-infrastructure teardown deferred until the 30-day stability window elapses (~2026-06-11); §J store launch + signing handled separately by the project owner.
>
> Active NoteSync/Notate development happens in the `notate` repo only. The `derekentringer-com` repo retains the historical `ns-*` packages for audit/reference and receives no further releases. These migration docs live in `docs/historical/notesync-to-notate-migration/` in both repos as the preserved audit trail.

A multi-phase plan for renaming **NoteSync** to **Notate** and moving the four NS packages out of the `derekentringer-com` monorepo into a dedicated `notate` repo on a new GitHub org, with the production stack rehosted on `notate.md` under fresh service accounts.

This plan **only** covers the four NoteSync packages (`ns-api`, `ns-web`, `ns-desktop`, `ns-mobile`) plus whatever portion of `packages/shared` they need. The `fin-*` packages and the root `web` / `api` portfolio remain on `derekentringer.com`.

## Why a new repo + accounts (not just a domain change)

The original [`30-branding-and-domain-migration.md`](../../web/docs/feature_planning/30-branding-and-domain-migration.md) (now deleted) treated this as a domain swap inside the existing repo and accounts. The decision after that doc was written: cleanly separate the NS product from the personal portfolio, so:

- The new `notate` repo can be public / open-sourced without dragging `derekentringer-com` portfolio code along.
- Service accounts (Railway, Cloudflare, R2, Anthropic, OpenAI, Resend) get fresh quotas, billing, and audit trails scoped to the product.
- Future contributors / collaborators get permissions on a Notate-specific GitHub org rather than my personal account.
- The NS Postgres database moves with the product; portfolio infra stays put.

Icons stay the same — the only branding change is the name.

## Phase index

| # | Phase | Goal | Risk |
|---|-------|------|------|
| 0 | [Decisions & inventory](./phase-00-decisions-and-inventory.md) | Lock in the open questions (package names, GitHub org, npm scope, user data). Catalog every NoteSync reference. | Low |
| 1 | [New accounts & infrastructure](./phase-01-new-accounts-setup.md) | Register `notate.md`, create the GitHub org + repo, stand up new Railway / Cloudflare / R2 / Resend / Anthropic / OpenAI accounts. | Low — can run alongside production |
| 2 | [Source-code rename](./phase-02-source-code-rename.md) | In a *temporary* fork of the current repo, refactor every NoteSync reference (file/folder names, package names, identifiers, UI strings, comments, docs) and verify everything still type-checks + tests pass. | Medium — many touchpoints |
| 3 | [Monorepo extraction](./phase-03-monorepo-extraction.md) | Copy the renamed NS packages + needed `shared` content into the new `notate` repo. Decide and execute the shared-package split. | Medium — coordination between two repos |
| 4 | [CI/CD + tooling parity](./phase-04-ci-cd-setup.md) | Bring GitHub Actions, Turborepo config, eslint/prettier, type-check, test pipelines online on the new repo. | Low |
| 5 | [Database migration](./phase-05-database-migration.md) | Postgres dump from old `ns-api` Railway DB → restore into new Railway DB, with downtime window or replication-style cutover. | High — any data loss is bad |
| 6 | [Service deployment](./phase-06-service-deployment.md) | Deploy `api`, `web` to new Railway services. Validate against the migrated DB on a staging subdomain (`staging.notate.md`). | Medium |
| 7 | [Domain, DNS, SSL](./phase-07-domain-and-dns.md) | Wire `notate.md` (apex + `api.notate.md`) through Cloudflare to Railway with SSL, plus the R2 image subdomain. Set up the `ns.derekentringer.com` → `notate.md` 301 redirect plan. | Medium |
| 8 | [Client app updates](./phase-08-client-updates.md) | New mobile bundle IDs (Android + iOS), new desktop bundle ID + Tauri identifier, baked-in production API URLs, builds + sideload + (eventually) store submissions. | High — bundle ID changes are non-reversible for existing installs |
| 9 | [Cutover](./phase-09-cutover.md) | Coordinated DNS flip, freeze writes on the old DB, final dump+restore, verify, unfreeze. WebAuthn passkey re-registration messaging. | High |
| 10 | [Post-migration cleanup](./phase-10-post-migration-cleanup.md) | Archive the NS packages in the old repo, delete the old Railway services after the rollback window, sunset Cloudflare records, remove env vars from old accounts, file `derekentringer-com` Phase 5 (Polish & Distribution) doc updates. | Low |

## Cross-cutting decisions (resolved)

- **Final domain**: `notate.md` ✅
- **Package naming**: drop the `ns-` prefix → `web`, `api`, `desktop`, `mobile`, `shared` ✅
- **Repo structure**: single monorepo at `<github-org>/notate` containing all 5 packages ✅
- **NPM workspace scope**: `@notate/*` (workspace-internal; no npm publish required) ✅
- **GitHub org**: PixelPerfect Studios LLC. Repo: `notate`. ✅
- **Bundle identifier** (desktop + mobile): `md.notate.app` (prod) / `md.notate.app.dev` (dev variant for side-by-side installs) ✅
- **Existing data**: pre-launch, single user (the developer). Carry the database forward as a "developer migration" — no public-coordination cost since there are no public users yet. ✅
- **WebAuthn passkeys**: developer-only re-registration; one-time effort during the cutover, no user comms needed.

## Why this is dramatically simpler than a public migration

Notate is **pre-launch with a single user (the developer)**. That changes the risk profile of every phase:

- **Phase 5 (DB migration)** — no downtime concerns, no read-only window needed; the developer just stops using the app for 5 minutes.
- **Phase 7 (DNS)** — TTL pre-drop is unnecessary; the only resolver that matters is the developer's own.
- **Phase 8 (clients)** — bundle ID changes don't strand a tester base; the developer reinstalls once.
- **Phase 9 (cutover)** — no announcement emails, no WebAuthn re-registration support, no rollback drama.
- **Phase 10 (cleanup)** — no 30-day stability soak required against real-world traffic; the developer can sunset the old stack as soon as the new one feels good.

The phase docs still capture the *full procedure* in case Notate launches publicly later and a similar migration becomes a reference for that audience. For now, treat each phase as a developer checklist, not a coordinated rollout.

## Conventions used in this plan

- **Status legend** — every phase starts with one of:
  - 🟡 Not started
  - 🟠 In progress
  - 🔷 Shipped
- **Ownership** — single-owner project, but each phase calls out who/what is the dependency (e.g., "blocks Phase 7", "needs Phase 0 input X").
- **Checklists** — each phase has a literal `- [ ]` checklist that doubles as the source of truth for tracking.
