# 06 — Net Worth Tracking

**Status:** Complete
**Phase:** 4 — Dashboard & Tracking
**Priority:** High

## Summary

Aggregate all account balances into a net worth dashboard with historical tracking and trend visualization. Assets minus liabilities = net worth, tracked over time. Includes per-account balance history charts (e.g., checking account) with configurable time range and granularity controls.

## Requirements

- Net worth calculation: sum of all asset accounts (checking, savings, HYS, investments) minus all liability accounts (credit cards, loans)
- Dashboard view showing:
  - Current net worth (large, prominent number)
  - Breakdown by account type (assets vs. liabilities)
  - Individual account balances
  - Net worth trend chart over time (area chart) with view toggle: Overview (3-line), Assets (per-account), Liabilities (per-account)
  - Per-account balance history chart (e.g., checking account balance over time)
- Historical tracking:
  - Net worth history reconstructed from Balance table records (PDF statement snapshots)
  - Per-account balance history reconstructed from transaction records (working backwards from current balance)
  - Configurable granularity: weekly or monthly data points
- Time range filters: 1M, 3M, 6M, 12M, YTD, All — per-chart controls with pill-style toggle buttons
- Granularity toggle: Weekly (W) / Monthly (M) — per-chart
- Visual indicators for positive/negative trends (up/down arrows, color coding)
- Tooltip with full date (including year) on chart hover

## Technical Considerations

- Balance history captured on CSV import and PDF statement import (no scheduled cron)
- Net worth history uses Balance table records with carry-forward for gaps
- Per-account (checking) history reconstructs balances from transactions by working backwards from currentBalance
- Chart library: Recharts (React-only; Victory deferred to mobile phase)
- Time range and granularity are per-chart controls — each chart card manages its own state and re-fetches independently
- Backend computes `startDate` from range string; `undefined` for "all" (no date filter)
- Weekly keys use ISO week start (Monday); monthly keys use YYYY-MM format

## Dependencies

- [03 — Account Management](03-account-management.md) — needs accounts with balances
- [02 — Database & Encryption](02-database-and-encryption.md) — needs balance history schema

## Resolved Open Questions

- Snapshot frequency: on-import (CSV and PDF); no scheduled cron job
- Investment accounts show current balance (market value) as reported by institution
- Accounts added mid-history: carry-forward logic fills gaps; neutral trend tickers shown
- Chart library: Recharts (Victory deferred to mobile phase)
- Time range: user-selectable (1M, 3M, 6M, 12M, YTD, All) with per-chart controls
- Granularity: user-selectable (weekly/monthly) with per-chart toggle
