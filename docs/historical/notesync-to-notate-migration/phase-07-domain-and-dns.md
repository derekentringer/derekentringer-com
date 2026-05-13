# Phase 7 — Domain, DNS, SSL

**Status**: ✅ Complete. All four Notate domains (`notate.md`, `api.notate.md`, `img.notate.md`, `www.notate.md`) are live with valid SSL. The new domain is fully receiving traffic — there's no traffic to "flip" later (single-user pre-launch, no existing public users).

**Live endpoints**:
- web: https://notate.md → 200
- api: https://api.notate.md/health → 200 `{"status":"ok"}`
- images: https://img.notate.md (R2 bucket, set up in Phase 1 § R2)
- www: https://www.notate.md → 301 → notate.md (Cloudflare Redirect Rule)

## Tasks

### A. Apex + www

- [x] Cloudflare CNAME for `notate.md` (apex) → Railway target for `web` service (proxy off during Railway SSL validation, then flipped to **orange cloud / proxied** for caching + DDoS once green)
- [x] `www.notate.md` handled via Cloudflare **Redirect Rule** (template: "Redirect from WWW to root") — 301s `https://www.notate.md/<path>` → `https://notate.md/<path>` with query string preserved. `www` CNAME on orange cloud (Cloudflare proxy required for the redirect rule to fire).

### B. API subdomain

- [x] Cloudflare CNAME for `api.notate.md` → Railway target for `api` service
- [x] **Gray cloud / DNS-only** (permanent) — Cloudflare's proxy can buffer SSE frames and break long-lived connections; api must be direct-to-Railway

### C. R2 image subdomain

- [x] **Done in Phase 1 § R2** — `img.notate.md` bound to the `notate-images` R2 bucket via Connect Domain. SSL cert auto-issued by Cloudflare. `curl -I https://img.notate.md/` returns `HTTP/2 404 server: cloudflare` (404 expected for a missing key; the response proves the domain is live).

### D. Email DNS records

- [x] **Done in Phase 1 § Resend** — DKIM / SPF / DMARC TXT records in Cloudflare; `notate.md` is a verified sending domain in Resend.

### E. ~~TTL drop~~ — skipped

Single-user pre-launch; no public users to insulate from propagation delay. Default Cloudflare TTLs are fine.

### F. ~~Old-domain redirect plan~~ — skipped

Phase 0 + Phase 5 decisions: no 301 redirects from old domains. The only old-domain references in flight are image URLs embedded in note content, which are rewritten in-place during Phase 9 cutover (Phase 5 § D SQL). Old domains will simply stop resolving when Phase 10 retires the old Railway services.

### G. DNS dry run

External `dig` confirms:

- `api.notate.md` → CNAME `k6yg9ms1.up.railway.app` → A `66.33.22.58` (Railway direct)
- `notate.md` → A `104.21.63.230`, `172.67.172.149` (Cloudflare proxy)
- SSL valid on all four endpoints (Let's Encrypt for Railway-backed; Cloudflare Universal SSL for R2)

Smoke tests run from CLI:

| Endpoint | Result |
|---|---|
| `https://api.notate.md/health` | 200 `{"status":"ok"}` |
| `https://notate.md/` | 200; bundle baked with `https://api.notate.md` |
| `OPTIONS /auth/login` from `notate.md` origin | 204 + `access-control-allow-origin: https://notate.md` |
| `https://www.notate.md/` | 301 → `https://notate.md/` |
| `https://img.notate.md/` | 404 (expected; no key requested) — `server: cloudflare` |

## Verification gates

- [x] All four endpoints (`notate.md`, `api.notate.md`, `img.notate.md`, `www.notate.md`) resolve and serve over HTTPS
- [x] CORS + cross-origin requests work end-to-end (web ↔ api)
- [x] www → apex redirect fires

## Done criteria

- [x] DNS records live
- [x] SSL valid on all four endpoints
- [x] env vars (`CORS_ORIGIN`, `APP_URL`, `VITE_API_URL`) flipped from `*.up.railway.app` refs to explicit `notate.md` / `api.notate.md` constants; web redeployed so the new `VITE_API_URL` is baked into the bundle

## What does NOT happen here

- No production data migration (Phase 9 — `pg_dump`/`pg_restore` + R2 sync + URL rewrite)
- No client app rebuilds with the new URLs (Phase 8)

> **Gotchas captured during execution**:
>
> 1. **Cloudflare proxy blocks Railway's SSL validation**. Initial Let's Encrypt HTTP-01 challenge fails if the apex CNAME is on orange cloud during validation. Sequence: gray cloud → wait for Railway green → flip to orange.
> 2. **Cloudflare Redirect Rule needs proxied DNS to fire**. Adding a redirect rule for `www.notate.md` won't do anything if the `www` CNAME is on gray cloud — Cloudflare's edge only applies rules to requests that hit its proxy.
> 3. **Railway custom-domain SSL state polls infrequently**. "Submitting certificate signing request" can sit for 5+ minutes even after DNS resolves correctly; just wait it out before assuming something's wrong.
> 4. **`VITE_API_URL` is build-time, not runtime**. Updating it on Railway requires a redeploy of `web` to bake the new value into the bundle. The bundle JS file hash changes (e.g., `index-Cdd35qsu.js` → `index-B-PyWjYo.js`) when the value changes.
