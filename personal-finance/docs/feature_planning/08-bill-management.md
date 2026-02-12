# 08 — Bill Management

**Status:** Not Started
**Phase:** 3 — Dashboard & Tracking
**Priority:** High

## Summary

Track recurring bills with due dates, amounts, and payment status. Surface upcoming bills and overdue payments on the dashboard.

## Requirements

- Bill records with:
  - Name (e.g., "Rent", "Netflix", "Car Insurance")
  - Amount (fixed or estimated)
  - Due date (day of month or specific date)
  - Frequency (monthly, quarterly, annually, one-time)
  - Category
  - Auto-pay status (yes/no)
  - Account it's paid from
  - Active/inactive flag
- Dashboard features:
  - Upcoming bills in the next 7/14/30 days
  - Bills due today
  - Overdue bills (past due date, not yet matched to a transaction)
  - Total monthly bill obligations
- Auto-matching: when a CSV import brings in a transaction that matches a bill (by description and approximate amount), mark the bill as paid for that period
- Calendar view of bill due dates for the month
- Notifications/reminders (web-based — banner or dashboard alert)

## Technical Considerations

- Bill recurrence: store the pattern (day of month + frequency) and generate upcoming instances
- Matching imported transactions to bills: fuzzy match on description + amount within a tolerance (e.g., ±$5)
- Consider a `Bill` table and a `BillPayment` table (tracks each payment instance)
- Bills feed into the Budgeting feature as fixed expenses

## Dependencies

- [03 — Account Management](03-account-management.md) — bills are paid from accounts
- [04 — CSV Import System](04-csv-import-system.md) — for auto-matching payments
- [05 — Category Rule Engine](05-category-rule-engine.md) — bills have categories

## Open Questions

- Should bills auto-detect from recurring transactions in import history?
- Email/push notification support, or dashboard-only alerts?
- How to handle variable-amount bills (e.g., electric bill varies month to month)?
