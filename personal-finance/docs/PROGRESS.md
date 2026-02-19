# Personal Finance Tool — Progress Tracker

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Backend | Node.js + Fastify | Fast, built-in schema validation |
| Database | PostgreSQL | Relational data ideal for financial records |
| ORM | Prisma | Type-safe, generates migrations |
| Web Frontend | React + Vite | Shares types/logic with mobile |
| Mobile | React Native | Android-focused, cross-platform ready |
| Charts | Recharts or Victory | Victory has React Native support (TBD) |
| Language | TypeScript | Everywhere — API, web, mobile, shared |
| Monorepo | Turborepo | Shared builds across packages |
| Hosting | Railway | API + web + Postgres in one platform |
| Encryption | AES-256-GCM | Application-level field encryption |
| Auth | JWT + bcrypt | Single-user gated access |
| AI Extraction | Anthropic Claude API | PDF statement parsing via tool use |
| PDF Parsing | pdf-parse | Text extraction from PDF statements |

## Architecture Decisions

- **Monorepo** — `packages/api`, `packages/web`, `packages/mobile`, `packages/shared`
- **No Plaid** — CSV import from banks instead (Chase, Amex); Plaid too expensive for single-user tool
- **Railway hosting** — API as Node.js service, web as static/Node service, Postgres via Railway plugin
- **Field-level encryption** — sensitive fields (account numbers, balances, profile data) encrypted with AES-256-GCM before storing in Postgres; master key stored as Railway env var
- **Custom domains** — `fin.derekentringer.com` (web) + `fin-api.derekentringer.com` (API); subdomain approach avoids routing conflicts with portfolio site
- **AI-powered PDF extraction** — Claude API with account-type-aware tool schemas extracts structured data from any bank/institution statement format; no per-institution parser needed for PDF statements
- **Account-type profiles** — LoanProfile, InvestmentProfile, SavingsProfile as separate models attached to Balance records; extensible without schema bloat

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

- [x] [06 — Net Worth Tracking](features/06-net-worth-tracking.md)
- [x] [07 — Budgeting & Expense Tracking](features/07-budgeting-expense-tracking.md)
- [x] [08 — Bill Management](features/08-bill-management.md)

### Phase 5: Projections & Planning — Medium Priority

- [ ] [09 — Net Income Projections](feature_planning/09-net-income-projections.md)
- [ ] [10 — Savings Projections](feature_planning/10-savings-projections.md)
- [ ] [11 — Debt Payoff Planning](feature_planning/11-debt-payoff-planning.md)
- [ ] [12 — Financial Goal Planning](feature_planning/12-financial-goal-planning.md)

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
