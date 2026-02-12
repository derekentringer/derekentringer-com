# 06 — Net Worth Tracking

**Status:** Not Started
**Phase:** 3 — Dashboard & Tracking
**Priority:** High

## Summary

Aggregate all account balances into a net worth dashboard with historical tracking and trend visualization. Assets minus liabilities = net worth, tracked over time.

## Requirements

- Net worth calculation: sum of all asset accounts (checking, savings, HYS, investments) minus all liability accounts (credit cards, loans)
- Dashboard view showing:
  - Current net worth (large, prominent number)
  - Breakdown by account type (assets vs. liabilities)
  - Individual account balances
  - Net worth trend chart over time (line chart)
- Historical tracking:
  - Snapshot net worth at regular intervals (daily, weekly, or on each data import)
  - Store balance history per account for time-series display
- Time range filters: 1 month, 3 months, 6 months, 1 year, all time
- Visual indicators for positive/negative trends (up/down arrows, color coding)

## Technical Considerations

- Balance history can be captured:
  1. Automatically when CSV imports update account balances
  2. Via a scheduled job that snapshots all balances daily
  3. Manually when the user updates an account balance
- Chart library: Recharts or Victory (TBD — Victory has React Native support)
- Net worth is computed, not stored — calculate from current account balances
- Historical net worth is reconstructed from balance history snapshots
- Consider a `BalanceSnapshot` table: `{ accountId, balance, date }`

## Dependencies

- [03 — Account Management](03-account-management.md) — needs accounts with balances
- [02 — Database & Encryption](02-database-and-encryption.md) — needs balance history schema

## Open Questions

- Snapshot frequency: daily cron, on-import, or manual trigger?
- Should investment accounts show market value or cost basis?
- How to handle accounts added mid-history (no prior balance data)?
