# 11 — Account Type Pages & Chart Improvements

**Status:** Complete
**Phase:** 4 — Dashboard & Tracking
**Priority:** High

## Summary

Enhanced account type pages with inline profile cards, market mortgage rate comparison badges, investment KPIs with sparklines, and fixed chart rendering for snapshot-driven accounts. Also added a FRED API integration for real-time market mortgage rates.

## What Was Implemented

### Market Mortgage Rates (FRED API Integration)

#### Shared Package (`packages/shared/`)

- `MortgageRatesResponse` type — `rate30yr: number | null`, `rate15yr: number | null`, `asOf: string | null`

#### Finance API (`packages/finance-api/`)

**Config (`src/config.ts`):**
- Added `fredApiKey` field (reads `FRED_API_KEY` env var, defaults to empty string; not required)

**Dashboard Routes (`src/routes/dashboard.ts`):**
- `GET /dashboard/mortgage-rates` — fetches current 30-year and 15-year fixed mortgage rates from FRED API (Federal Reserve Economic Data)
  - Series: `MORTGAGE30US` (30-year fixed), `MORTGAGE15US` (15-year fixed)
  - In-memory cache with 24-hour TTL to minimize API calls
  - Returns `{ rate30yr: null, rate15yr: null, asOf: null }` when no `FRED_API_KEY` configured or on fetch failure
  - `fetchFredRate(seriesId, apiKey)` helper fetches latest observation from FRED

#### Finance Web (`packages/finance-web/`)

**API Client (`src/api/dashboard.ts`):**
- `fetchMortgageRates()` — GET /dashboard/mortgage-rates

**AccountTypePage (`src/pages/AccountTypePage.tsx`):**
- `marketRates` state fetched when page slug is `"real-estate"`
- `LoanProfileTiered` component accepts optional `marketRates` prop
- Displays "30yr: X.XX%" and "15yr: X.XX%" badges below Interest Rate in loan profile cards
- Badges only appear for real-estate accounts (not loans page)
- Uses `bg-input text-muted-foreground` styling at `text-[10px]` size

### Investments Page Layout

**AccountTypePage (`src/pages/AccountTypePage.tsx`):**
- `InvestmentProfileTiered` component updated with `className` prop support and `flex-1` on content
- Tier 1 grid changed from `grid-cols-2 sm:grid-cols-3` to `grid-cols-2` for sidebar display
- Investments page list view now uses 12-col grid layout: chart (9 cols) + profile card (3 cols) inline
- Matches the layout pattern used by Loans and Real Estate pages
- Shows "No profile data" placeholder when no investment profile exists
- Removed separate below-chart investment profile rendering

### Investment KPIs with Sparklines

**AccountTypePage (`src/pages/AccountTypePage.tsx`):**

Replaced previous investment KPIs (Total Balance + Total Gain/Loss + Avg Return) with ordered set:

1. **YTD Return** — Average YTD return % across accounts; sparkline tracks trend over recent balance history (averaged per period across accounts)
2. **Total Contributions** — Sum of contributions across accounts; sparkline tracks contribution trend
3. **Total Balance** — With 30d trend + sparkline (repositioned from default slot)
4. **Total Dividends** — Sum of dividends across accounts; sparkline tracks dividend trend

All four KPIs always render (defaulting to 0 when no data), ensuring consistent 4-card layout. Display values use most recent non-null value from balance history per account (not just latest balance entry), so the displayed number matches the sparkline's most recent data point.

### Chart Rendering Fix: Snapshot-Driven Accounts

**Dashboard Store (`packages/finance-api/src/store/dashboardStore.ts`):**

`computeAccountBalanceHistory()` now branches by account type:

- **Snapshot-driven accounts** (Investment, Real Estate, Loan): Uses actual balance entries from the Balance table (PDF statement imports), plotted chronologically. Aggregates by period using latest balance per period.
- **Transaction-driven accounts** (Checking, Savings, Credit): Keeps existing backwards reconstruction from transactions (start at `currentBalance`, subtract each period's net transaction amount going backwards).

**Root cause of the bug:** The transaction-based backwards reconstruction subtracted recorded transactions from `currentBalance` to derive historical balances. For investment accounts, this produced negative starting balances because contributions (positive transactions) were subtracted, but market gains (which aren't transactions) were not accounted for. For loan accounts, the chart was flat-lined because loan payments are captured as balance snapshots from PDF imports, not as individual transactions.

**AccountBalanceCard (`packages/finance-web/src/components/dashboard/AccountBalanceCard.tsx`):**
- Added `domain` prop to YAxis: floors at 0 when all data is positive, allows negative when data actually contains negative values
- Prevents Recharts auto-scaling from showing negative Y-axis values for accounts with all-positive balances

## Files Modified

### Finance API
- `packages/finance-api/src/config.ts` — added `fredApiKey` field
- `packages/finance-api/src/routes/dashboard.ts` — added `GET /mortgage-rates` endpoint with FRED API fetch + cache
- `packages/finance-api/src/store/dashboardStore.ts` — snapshot-driven chart rendering for Investment, Real Estate, Loan accounts

### Shared
- `packages/shared/src/finance/types.ts` — added `MortgageRatesResponse` type
- `packages/shared/src/index.ts` — exported `MortgageRatesResponse`

### Finance Web
- `packages/finance-web/src/api/dashboard.ts` — added `fetchMortgageRates()`
- `packages/finance-web/src/pages/AccountTypePage.tsx` — market rate badges, investments inline layout, investment KPIs, mortgage rates fetch
- `packages/finance-web/src/components/dashboard/AccountBalanceCard.tsx` — YAxis domain fix

## Dependencies

- [03 — Account Management](03-account-management.md) — needs accounts with balances
- [06 — Net Worth Tracking](06-net-worth-tracking.md) — account balance history charts
- [PDF Statement Import](pdf-statement-import.md) — balance snapshots for chart data

## Resolved Open Questions

- **Chart data source for investments/loans/real-estate**: Balance table snapshots (not transaction reconstruction)
- **Chart data source for checking/savings/credit**: Transaction-based backwards reconstruction (unchanged)
- **YAxis domain**: Floors at 0 for positive-balance accounts; allows negative for credit/loan accounts
- **Market rate data source**: FRED API (Federal Reserve Economic Data) — free, reliable, updated weekly
- **Market rate caching**: 24-hour in-memory TTL; graceful degradation when no API key configured
- **Investment KPI values**: Most recent non-null value from balance history per account (not just latest balance)
