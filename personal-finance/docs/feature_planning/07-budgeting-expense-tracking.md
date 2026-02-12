# 07 — Budgeting & Expense Tracking

**Status:** Not Started
**Phase:** 3 — Dashboard & Tracking
**Priority:** High

## Summary

Categorize spending, set monthly budgets per category, and track actual spending against budget goals. Replaces the Google Sheets workflow for monthly expense tracking.

## Requirements

- Monthly budget setup:
  - Set a target amount per category (e.g., Groceries: $600/month, Dining: $200/month)
  - Overall monthly spending target
  - Budgets roll over month-to-month (persist until changed)
- Expense tracking:
  - View spending by category for any month
  - Compare actual vs. budget per category (progress bars, over/under indicators)
  - Drill down into individual transactions within a category
- Dashboard widgets:
  - Total spent this month vs. budget
  - Category breakdown (bar chart or pie chart)
  - Top spending categories
  - Over-budget alerts
- Trends:
  - Month-over-month spending comparison
  - Average spending per category over time
- Income tracking:
  - Separate income transactions (positive amounts, paychecks, transfers in)
  - Net income = income minus expenses for the month

## Technical Considerations

- Budget data model: `{ category, monthlyAmount, effectiveFrom }` — allows changing budgets without losing history
- Spending is calculated from categorized transactions (depends on Category Rule Engine)
- Uncategorized transactions should be flagged prominently — budget accuracy depends on categorization coverage
- Time-based queries on transactions: filter by month/year efficiently (index on date column)

## Dependencies

- [04 — CSV Import System](04-csv-import-system.md) — needs transaction data
- [05 — Category Rule Engine](05-category-rule-engine.md) — needs categorized transactions

## Open Questions

- Should budgets support bi-weekly or custom periods (aligned with pay cycles)?
- Carry over unused budget to next month, or strict monthly reset?
- How to handle refunds — subtract from category spending or treat as income?
