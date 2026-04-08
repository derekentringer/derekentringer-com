# 30 — Branding & Domain Migration

**Status:** Planned
**Phase:** Phase 0 — Pre-Launch
**Priority:** Critical (blocks all public-facing work)

## Summary

Choose a product name, secure the .com domain, and migrate all infrastructure from `ns.derekentringer.com` to the new domain. This must happen before any public launch, App Store submission, or marketing site — brand identity needs to be final before users see it.

## Steps

### 1. Choose Product Name

Criteria:
- Short, memorable, easy to spell
- .com available
- Not already a note-taking app or well-known product
- Works as a verb ("I'll [name] that") or noun ("check my [name]")
- App Store name available (search iOS/Android stores)
- Social handles available (Twitter/X, GitHub)

### 2. Secure Domain & Social

- Register .com domain (GoDaddy or Cloudflare Registrar)
- Register Twitter/X handle
- Create GitHub organization (if open-sourcing later)
- Register on Product Hunt (claim name before launch)

### 3. Update Application Branding

**Files to update across all packages:**

- `packages/ns-web/index.html` — title, meta tags, favicon references
- `packages/ns-web/public/site.webmanifest` — app name, short_name
- `packages/ns-web/src/components/NsLogo.tsx` — component name, potentially new logo
- `packages/ns-web/src/pages/LoginPage.tsx` — branding text
- `packages/ns-desktop/src-tauri/tauri.conf.json` — `productName`, `identifier` (com.newname.app)
- `packages/ns-desktop/src-tauri/Info.plist` — usage descriptions referencing app name
- `packages/ns-mobile/app.json` — Expo config, app name, bundle ID
- `packages/ns-api/` — any references to "NoteSync" in responses or emails
- Resend email templates — password reset, welcome emails
- `CLAUDE.md` — all references to NoteSync

### 4. Migrate Infrastructure

**Railway:**
- Update custom domains on all 4 services (ns-web, ns-api, ns-desktop web, ns-mobile web)
- Update env vars: `CORS_ORIGIN`, `APP_URL`, `VITE_API_URL`, `RP_ID` (WebAuthn)
- Update start commands if any reference old domain

**Cloudflare:**
- Add new domain to Cloudflare
- Create DNS records pointing to Railway
- Set up SSL (automatic with Cloudflare proxy)
- Redirect old ns.derekentringer.com to new domain (301 redirects)

**Cloudflare R2:**
- Update `R2_PUBLIC_URL` to new image subdomain (e.g., images.newname.com)
- Create CNAME for new image domain

**Desktop app:**
- Update `RP_ID` for WebAuthn passkeys (domain change breaks existing passkeys — users need to re-register)
- Update SQLite database name in `dbName.ts`
- Update Tauri bundle identifier

### 5. Verification

- All web services respond on new domain
- Login/registration works (CORS, cookies, WebAuthn)
- Image upload/display works (R2 public URL)
- Desktop app connects to new API domain
- Mobile app connects to new API domain
- Old domain redirects to new domain
- Email links (password reset) use new domain
- Sync (SSE, push/pull) works on new domain

## Key Risks

- **WebAuthn passkeys break on domain change** — `RP_ID` is tied to domain. Users need to re-register passkeys. Plan a migration path or notify users.
- **SEO** — 301 redirects from old domain preserve any existing search ranking
- **Bookmarks/links** — Users with bookmarked old URLs need redirects
- **Desktop app update** — Existing desktop installs point to old API. Need to ship an update with new URL before or alongside the migration.
