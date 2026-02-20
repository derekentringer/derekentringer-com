# 10 — Savings Projections

**Status:** Complete — see [features/10-savings-projections.md](../features/10-savings-projections.md)
**Phase:** 5 — Projections & Planning
**Priority:** Medium

## Summary

Project savings account growth over time based on current balances, contribution rates, and interest (APY). Visualize how savings will grow under different contribution scenarios.

## Requirements

- Per-account projections for savings and HYS accounts:
  - Current balance as starting point
  - Monthly contribution amount (manual input or derived from historical average)
  - APY (interest rate from account record)
  - Compound interest calculation (monthly compounding)
- Projection timeframes: 6 months, 1 year, 2 years, 5 years, 10 years
- Visualization:
  - Line chart showing projected balance over time
  - Stacked view: principal contributions vs. interest earned
  - Multiple accounts on the same chart for comparison
- Scenario modeling:
  - "What if I increase my monthly contribution by $500?"
  - "What if APY drops from 4.5% to 3.5%?"
  - Compare scenarios side-by-side
- Milestone markers: "At this rate, you'll reach $100k by [date]"

## Technical Considerations

- Compound interest formula: `A = P(1 + r/n)^(nt)` where n=12 for monthly compounding
- Historical contribution rate can be estimated from transaction history (recurring transfers to savings accounts)
- APY changes over time — use current APY for projections but allow user to input expected rate changes
- Projections are computed on-demand from current account data

## Dependencies

- [03 — Account Management](03-account-management.md) — needs account balances and interest rates
- [06 — Net Worth Tracking](06-net-worth-tracking.md) — balance history informs contribution estimates

## Open Questions

- Should projections factor in expected withdrawals (e.g., upcoming large purchases)?
- How to handle multiple HYS accounts with different APYs?
- Include tax implications on interest income?
