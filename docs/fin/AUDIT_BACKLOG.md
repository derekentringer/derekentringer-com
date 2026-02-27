# Production Audit Backlog

Findings from the architecture/security/performance audit (2026-02-27).
Items marked **DONE** have been addressed. Remaining items are prioritized for follow-up.

## CRITICAL

- [x] **C1** — PIN token signing key override may be silently ignored (`finance-api/src/routes/auth.ts:288-291`)
- [x] **C2** — No error boundary in finance-web (`finance-web/src/App.tsx`)

## HIGH

- [x] **H3** — Holding & Goal delete not PIN-protected (`finance-api/src/routes/holdings.ts`, `goals.ts`)
- [x] **H1** — ACCEPTED RISK: SSL cert verification disabled for production DB (`finance-api/src/lib/prisma.ts:16`). Railway Postgres does not provide a CA certificate for verified SSL. Traffic stays within Railway's private network. Revisit if Railway adds CA cert support.
- [x] **H2** — ACCEPTED RISK: No certificate pinning on mobile (`mobile/src/services/api.ts`). Single-user sideloaded app on a personal device; standard TLS is sufficient. Revisit if distributed to other users.
- [x] **H4** — ACCEPTED RISK: CORS allows null-origin requests (`finance-api/src/app.ts:50-55`). Required for mobile app (React Native requests have no Origin header). All endpoints require JWT authentication, limiting exposure.
- [x] **H5** — ACCEPTED RISK: Refresh token in response body for mobile via `X-Client-Type: mobile` header (`finance-api/src/routes/auth.ts:115`). Header is spoofable, but an XSS attacker who can set headers already has access to the in-memory access token. Single-user app with no public registration.
- [ ] **H6** — Financial data sent to Anthropic API unredacted (`finance-api/src/lib/anthropicService.ts:115`). Ensure AI insights default to OFF; add UI disclaimer.

## MEDIUM

- [ ] **M1** — Transaction search decrypts up to 2000 rows in-memory (`finance-api/src/store/transactionStore.ts:44-80`). Consider searchable hash index.
- [ ] **M2** — DB connection pool hardcoded to 10, no timeout config (`finance-api/src/lib/prisma.ts:15`). Expose via env vars, add idle/connection timeouts.
- [ ] **M3** — Dashboard fetches ALL balances when no startDate (`finance-api/src/store/dashboardStore.ts:170-175`). Default to 2 years max.
- [ ] **M4** — Notification evaluators run serially (`finance-api/src/lib/notificationEvaluator.ts:648-658`). Use `Promise.allSettled` for parallel execution.
- [ ] **M5** — Category rule application scans all transactions (`finance-api/src/store/transactionStore.ts:186-236`). Add date range filter or background job.
- [ ] **M6** — `resetConfig()` exported with no env guard (`finance-api/src/config.ts:83-85`). Add `NODE_ENV !== "test"` guard.
- [ ] **M7** — Most CRUD endpoints rely only on global 200/min rate limit. Add specific write endpoint rate limits (~30/min).
- [ ] **M8** — Encryption key in memory for process lifetime (`finance-api/src/lib/encryption.ts:3-13`). Disable core dumps; consider `crypto.createSecretKey()`.

## LOW

- [ ] **L1** — `console.error` in FCM module instead of Fastify logger (`finance-api/src/lib/fcm.ts:47`). Use Fastify logger, add `LOG_LEVEL` env var.
- [ ] **L2** — No code splitting in finance-web (`finance-web/src/App.tsx`). Use `React.lazy()` for route-level splitting.
- [ ] **L3** — Hardcoded admin user ID (`finance-api/src/routes/auth.ts:22`, `mobile/src/store/authStore.ts:51`). Fine for single-user; document.
- [ ] **L4** — 5-min React Query staleTime may show stale financial data (`mobile/App.tsx:15-22`). Reduce to 1-2 min or per-query overrides.
- [ ] **L5** — No offline queue for mobile write operations. Add optimistic updates or replay queue.
- [ ] **L6** — No request timeout on Fastify server (`finance-api/src/app.ts`). Add `requestTimeout: 60000`.
- [ ] **L7** — CI audit only checks critical prod deps (`.github/workflows/ci.yml:22`). Add high-severity check for all deps.
