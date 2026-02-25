# 12 — Financial Goal Planning

**Status:** Complete — see [features/12-financial-goal-planning.md](../features/12-financial-goal-planning.md)
**Phase:** 5 — Projections & Planning
**Priority:** Medium

## Summary

Set and track financial goals like saving for a house, building an emergency fund, or retirement planning. Visualize progress and projected completion dates.

## Requirements

- Goal types:
  - **Savings goal** — save $X by [date] (e.g., house down payment, emergency fund)
  - **Debt payoff goal** — pay off [account] by [date]
  - **Net worth goal** — reach $X net worth by [date]
  - **Custom milestone** — any user-defined target
- Per-goal tracking:
  - Target amount
  - Target date (optional — can calculate based on contribution rate)
  - Current progress (auto-calculated from linked accounts)
  - Monthly contribution needed to reach goal on time
  - Progress bar / percentage complete
- Dashboard widget: active goals with progress indicators
- Goal detail view:
  - Progress chart over time
  - Projected completion date at current pace
  - "You need to save $X/month to reach this goal by [date]"
  - On-track / behind / ahead indicators
- Link goals to specific accounts (e.g., "House Fund" goal linked to a dedicated savings account)

## Technical Considerations

- Goals are stored records with target amount, date, and linked account(s)
- Progress is computed from current account balances or net worth
- Projection uses savings/net worth growth rate from historical data
- Goals can overlap (multiple goals drawing from same income/savings)

## Dependencies

- [03 — Account Management](03-account-management.md) — goals linked to accounts
- [06 — Net Worth Tracking](06-net-worth-tracking.md) — for net worth goals
- [10 — Savings Projections](10-savings-projections.md) — for savings goal projections

## Open Questions

- How to handle competing goals (e.g., saving for house AND paying off debt)?
- Should goals support automatic allocation suggestions ("put $X toward house, $Y toward emergency fund")?
- Priority ranking for goals?
