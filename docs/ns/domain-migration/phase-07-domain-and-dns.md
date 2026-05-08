# Phase 7 — Domain, DNS, SSL

**Status**: 🟡 Not started
**Depends on**: Phase 1 (Cloudflare zone), Phase 6 (staging subdomains validated)
**Blocks**: Phase 9 (cutover)
**Goal**: configure the production DNS records for `notate.md` (apex + `api` + `images` subdomains) and the redirect plan for the old `ns.derekentringer.com` URLs. By the end of this phase, the new domain is *ready* to receive traffic, but the actual flip happens during Phase 9.

This phase is mostly DNS + SSL coordination. The risk is in TTL planning — drop TTLs *before* the cutover so the flip propagates fast.

## Tasks

### A. Apex + www

- [ ] In Cloudflare, add an A or CNAME record for `notate.md` pointing to the Railway-provided target for the `web` service (Railway gives you a CNAME target like `xxx.up.railway.app`)
- [ ] Configure Cloudflare proxying (orange cloud) — this gives free SSL + DDoS + caching
- [ ] Add `www.notate.md` as either a redirect to `notate.md` (Cloudflare Page Rules / Bulk Redirects) or a CNAME to the same target

### B. API subdomain

- [ ] Add CNAME for `api.notate.md` → Railway target for the `api` service
- [ ] Cloudflare proxy: **off** (gray cloud) for the API. The api uses SSE; Cloudflare's proxy can buffer SSE frames and break long-lived connections. Direct DNS through to Railway is what the existing setup does for `ns-api.derekentringer.com`. Verify against current behavior.

### C. R2 image subdomain

- [ ] In Cloudflare, add a CNAME for `images.notate.md` → R2 public endpoint
- [ ] In R2 settings, link the bucket `notate-images` to the custom domain `images.notate.md`
- [ ] Verify SSL provisions (R2 issues a cert via Cloudflare)
- [ ] Test image fetch via curl: `curl -I https://images.notate.md/<known-key>` should return 200

### D. Email DNS records

Resend's DKIM / SPF / DMARC records were added in Phase 1. Re-verify here:

- [ ] DKIM TXT records in Cloudflare match what Resend's dashboard shows
- [ ] SPF record includes Resend's sender IP range
- [ ] DMARC policy: `p=none` for first 30 days (monitoring), then tighten to `quarantine` once delivery is stable

### E. TTL drop (the day before cutover)

DNS TTLs control how long resolvers cache records. To make the cutover propagate fast, drop TTLs ahead of time:

- [ ] 24h before cutover: drop TTL on every existing `ns.derekentringer.com` and `ns-api.derekentringer.com` record from default (often 1h or 24h) to **300 seconds**
- [ ] Wait for the previous TTL period to expire so resolvers pick up the new shorter TTL
- [ ] At cutover (Phase 9): records flip with the 300s window

This applies to the old domain (which we're redirecting away from). Set Cloudflare TTLs on the new `notate.md` records to whatever default you want (1h is fine).

### F. Old-domain redirect plan

After cutover, every old URL should 301 to the new equivalent so bookmarks, email links, and search results don't break.

| Old | New |
|-----|-----|
| `https://ns.derekentringer.com/` | `https://notate.md/` |
| `https://ns.derekentringer.com/notes/<id>` | `https://notate.md/notes/<id>` |
| `https://ns-api.derekentringer.com/*` | `https://api.notate.md/*` |
| `https://notesync-images.derekentringer.com/*` | `https://images.notate.md/*` |

Two implementation paths:

1. **Cloudflare Bulk Redirects** — declarative rules in Cloudflare's dashboard. Cheapest, no infrastructure overhead.
2. **Keep the old Railway services running** with a small redirect handler — more flexible (e.g., capture analytics on redirect hits) but costs $5/mo.

> **Recommendation**: Cloudflare Bulk Redirects. Free, fast, and there's nothing the old Railway services need to do that a 301 can't.

- [ ] In Cloudflare, create a Bulk Redirects list named `notesync-to-notate`
- [ ] Add rules:
  - [ ] `ns.derekentringer.com/*` → `notate.md/$1` (301, preserve query string)
  - [ ] `ns-api.derekentringer.com/*` → `api.notate.md/$1` (301)
  - [ ] `notesync-images.derekentringer.com/*` → `images.notate.md/$1` (301)
- [ ] Activate the redirect ruleset *immediately after* the cutover DNS flip

### G. Pre-cutover DNS dry run

- [ ] Use `dig`, `nslookup`, and a public DNS checker (e.g., dnschecker.org) to confirm:
  - [ ] `notate.md` and `api.notate.md` resolve to the new Railway endpoints from multiple geo regions
  - [ ] `images.notate.md` resolves to R2
  - [ ] Old domains still resolve to old Railway endpoints (cutover hasn't happened yet)
- [ ] Verify SSL certs are issued + valid on every new endpoint

## Verification gates

- [ ] All four new endpoints (`notate.md`, `api.notate.md`, `images.notate.md`, plus `staging.notate.md`) resolve and serve over HTTPS
- [ ] Bulk Redirects rules are *staged but not yet active*
- [ ] TTL drop on old records has been live for >24h before cutover

## Done criteria

- [ ] DNS records ready
- [ ] SSL valid
- [ ] Redirect rules drafted, ready to activate
- [ ] TTL drop in place

## What does NOT happen here

- No actual cutover (Phase 9)
- No client app rebuilds (Phase 8)
- No database changes (Phase 5)
