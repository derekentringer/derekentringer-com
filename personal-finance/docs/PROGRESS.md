# Personal Finance Tool — Progress Tracker

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Backend | Node.js + Fastify | Fast, built-in schema validation |
| Database | PostgreSQL | Relational data ideal for financial records |
| ORM | Prisma | Type-safe, generates migrations |
| Web Frontend | React + Vite | Shares types/logic with mobile |
| Mobile | React Native | Android-focused, cross-platform ready |
| Charts | Recharts | Area charts, pie charts; per-chart time range/granularity controls |
| Language | TypeScript | Everywhere — API, web, mobile, shared |
| Monorepo | Turborepo | Shared builds across packages |
| Hosting | Railway | API + web + Postgres in one platform |
| Encryption | AES-256-GCM | Application-level field encryption |
| Auth | JWT + bcrypt | Single-user gated access |
| AI Extraction | Anthropic Claude API | PDF statement parsing via tool use |
| PDF Parsing | pdf-parse | Text extraction from PDF statements |
| Push Notifications | Firebase Admin SDK | FCM for mobile push (web uses polling) |

## Architecture Decisions

- **Monorepo** — `packages/api`, `packages/web`, `packages/mobile`, `packages/shared`
- **No Plaid** — CSV import from banks instead (Chase, Amex); Plaid too expensive for single-user tool
- **Railway hosting** — API as Node.js service, web as static/Node service, Postgres via Railway plugin
- **Field-level encryption** — sensitive fields (account numbers, balances, profile data) encrypted with AES-256-GCM before storing in Postgres; master key stored as Railway env var
- **Custom domains** — `fin.derekentringer.com` (web) + `fin-api.derekentringer.com` (API); subdomain approach avoids routing conflicts with portfolio site
- **AI-powered PDF extraction** — Claude API with account-type-aware tool schemas extracts structured data from any bank/institution statement format; no per-institution parser needed for PDF statements
- **Account-type profiles** — LoanProfile, InvestmentProfile, SavingsProfile as separate models attached to Balance records; extensible without schema bloat
- **Favorite accounts** — `isFavorite` flag on accounts drives dashboard balance history charts and per-account projection charts on the Projections page
- **Expense projections** — Monthly expenses calculated from Bills + Budgets (not historical average spending), giving users explicit control over projected expenses
- **Notifications: polling for web, FCM for mobile** — Web uses 30s polling + browser Notification API (Firebase client SDK tokens unreliable on web); mobile will use FCM push via firebase-admin server SDK

## Phases

### Phase 1: Foundation — High Priority

- [x] [00 — Project Scaffolding](features/00-project-scaffolding.md)
- [x] [01 — Auth & Security](features/01-auth-and-security.md)
- [x] [02 — Database & Encryption](features/02-database-and-encryption.md)
- [x] [03 — Account Management](features/03-account-management.md)

### Phase 2: CSV Import — High Priority

- [x] [04 — CSV Import System](features/04-csv-import-system.md)
- [x] [05 — Category Rule Engine](features/05-category-rule-engine.md)

### Phase 3: Statement Import & Profiles — High Priority

- [x] [PDF Statement Import & Account Profiles](features/pdf-statement-import.md)

### Phase 4: Dashboard & Tracking — High Priority

- [x] [06 — Net Worth Tracking](features/06-net-worth-tracking.md) — net worth chart with view toggle (Overview/Assets/Liabilities), per-account balance history charts, configurable time range (1M/3M/6M/12M/YTD/All) and granularity (daily/weekly/monthly) per chart, 12M default for all dashboard charts, consistent chart styling (strokeWidth 1.5, gradient fills), KPI cards (Net Worth, Monthly Income, Monthly Spending, DTI) with sparklines for Net Worth and spending, mobile-responsive layouts across all pages, chart tooltips sorted by value descending
- [x] [07 — Budgeting & Expense Tracking](features/07-budgeting-expense-tracking.md)
- [x] [08 — Bill Management](features/08-bill-management.md)
- [x] [11 — Account Type Pages & Chart Improvements](features/11-account-type-pages.md) — market mortgage rate badges (FRED API), investments inline layout with KPI sparklines (YTD Return, Contributions, Balance, Dividends), snapshot-driven chart rendering for investment/real-estate/loan accounts, YAxis domain fix
- [x] [12 — Notification System](features/12-notification-system.md) — all 8 notification types: date-based reminders (Bill Due, Credit Payment Due, Loan Payment Due), threshold-based alerts (High Credit Utilization, Budget Overspend, Large Transaction), statement reminders, and milestones (net worth + loan payoff); browser notifications via polling, FCM for future mobile push, notification center bell icon, per-type preferences with config dialogs, 90-day log retention, soft-delete on clear (preserves dedup keys)

### Phase 5: Projections & Planning — Medium Priority

- [x] [09 — Net Income Projections](features/09-net-income-projections.md)
- [x] [10 — Savings Projections](features/10-savings-projections.md)
- [x] [11 — Debt Payoff Planning](features/11-debt-payoff-planning.md)
- [x] [12 — Financial Goal Planning](features/12-financial-goal-planning.md) — four goal types (savings, debt payoff, net worth, custom milestone) with progress tracking, mini projection charts with history, linked accounts, monthly contributions, drag-and-drop reordering, dashboard summary card, on-track/at-risk status badges

### Phase 6: Advanced Features — Medium Priority

- [ ] [13 — Investment Portfolio Analysis](feature_planning/13-investment-portfolio-analysis.md)
- [ ] [14 — Financial Decision Tools](feature_planning/14-financial-decision-tools.md)
- [ ] [15 — AI Financial Advice](feature_planning/15-ai-financial-advice.md)

### Phase 7: Mobile & PWA — Low Priority

- [ ] [16 — PWA Support](feature_planning/16-pwa-support.md)
- [ ] [17 — React Native Mobile App](feature_planning/17-react-native-mobile-app.md)

## Status Key

- `[ ]` Not Started
- `[~]` In Progress
- `[x]` Complete

## Workflow

1. Feature docs live in `docs/feature_planning/` while in backlog or in-progress
2. When a feature is fully implemented, move its doc to `docs/features/`
3. Update the checkbox and link path in this file
