# 09 — Net Income Projections

**Status:** Complete — see [features/09-net-income-projections.md](../features/09-net-income-projections.md)
**Phase:** 5 — Projections & Planning
**Priority:** Medium

## Summary

Project future net income based on current income sources, recurring expenses, and historical spending patterns. Replaces the Google Sheets net income projection workflow.

## Requirements

- Income sources configuration:
  - Salary/wages (amount, frequency — biweekly, monthly, etc.)
  - Side income / freelance (estimated monthly)
  - Interest income (from HYS accounts, calculated from balance × APY)
  - Other recurring income
- Projection calculation:
  - Monthly net income = total income − total expenses
  - Project forward 3, 6, 12, 24 months
  - Factor in known upcoming changes (raise, new bill, loan payoff date)
- Visualization:
  - Line chart of projected net income over time
  - Table view: month-by-month breakdown of income vs. expenses
  - Highlight months where expenses exceed income
- Scenario modeling:
  - "What if my rent increases by $200?"
  - "What if I get a 5% raise?"
  - Compare baseline vs. scenario projections side-by-side

## Technical Considerations

- Use historical spending averages (from categorized transactions) as the baseline for expense projections
- Known fixed expenses (bills) provide higher-confidence projections than variable spending
- Interest income calculation: `(balance × APY) / 12` per month — compounds as savings grow
- Projections are computed on-demand, not stored — recalculate from current data each time

## Dependencies

- [07 — Budgeting & Expense Tracking](07-budgeting-expense-tracking.md) — needs expense history for projections
- [08 — Bill Management](08-bill-management.md) — fixed expenses feed into projections

## Open Questions

- How to handle tax withholding — gross vs. net salary input?
- Should projections account for inflation?
- How granular should scenario modeling be (simple slider vs. full "what-if" editor)?
