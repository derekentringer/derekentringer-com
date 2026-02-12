# 11 — Debt Payoff Planning

**Status:** Not Started
**Phase:** 4 — Projections & Planning
**Priority:** Medium

## Summary

Calculate and visualize debt payoff timelines using snowball and avalanche strategies. Help decide the optimal approach to paying off loans and credit card balances.

## Requirements

- Input per debt account:
  - Current balance
  - Interest rate (APR)
  - Minimum monthly payment
  - Loan term (if applicable)
- Payoff strategies:
  - **Avalanche** — pay minimums on all, extra goes to highest interest rate first
  - **Snowball** — pay minimums on all, extra goes to smallest balance first
  - **Custom** — user defines payment priority order
- Extra payment input: "I can put $X/month extra toward debt"
- Payoff timeline visualization:
  - Chart showing each debt balance decreasing over time
  - Payoff date per debt
  - Total interest paid under each strategy
- Comparison view: avalanche vs. snowball side-by-side (total interest, time to debt-free)
- Amortization table: month-by-month breakdown of principal vs. interest payments
- Milestone: "You'll be debt-free by [date]"

## Technical Considerations

- Amortization calculations: standard loan amortization formula
- Credit card debt: minimum payment is typically a percentage of balance (e.g., 2%) or a fixed floor
- Handle both fixed-rate and variable-rate debts
- Recalculate as debts are paid off and freed-up minimums cascade to the next debt

## Dependencies

- [03 — Account Management](03-account-management.md) — needs loan/credit card accounts with balances and rates

## Open Questions

- Should this integrate with actual payment data from CSV imports to show actual vs. planned progress?
- How to handle debts with promotional 0% APR periods?
- Include mortgage payoff or focus on consumer debt only?
