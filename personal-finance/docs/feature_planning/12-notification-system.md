# 12 — Notification System

**Status:** Complete (see [features/12-notification-system.md](../features/12-notification-system.md))
**Phase:** 4 — Dashboard & Tracking
**Priority:** High

## Summary

Notification system for financial alerts — bill due dates, credit/loan payment reminders, budget overspend warnings, large transaction alerts, statement upload reminders, and net worth milestones. Web uses polling-based browser notifications; mobile (future) uses FCM push via firebase-admin.

## Requirements

- Scheduler-based notification evaluation running inside finance-api
- Per-type user preferences with enable/disable toggles and configurable thresholds
- Deduplication via unique keys to prevent duplicate alerts
- Browser notifications on web via polling (30s interval) + Notification API
- FCM push notifications for future React Native mobile app via firebase-admin
- Notification center (bell icon + popover) with unread count, mark-all-read, clear-all
- Settings UI with per-type toggles and configuration dialogs
- 90-day log retention with automatic cleanup
- Soft-delete on clear: "Clear All" sets `isCleared = true` instead of deleting rows, preserving dedup keys to prevent re-firing

## Phased Delivery

**Phase 1 (Complete):** Core infrastructure + 3 date-based reminder types (Bill Due, Credit Payment Due, Loan Payment Due)

**Phase 2 (Complete):** Threshold-based alerts (High Credit Utilization, Budget Overspend, Large Transaction)

**Phase 3 (Complete):** Statement Reminder + Milestones (net worth milestones, loan payoff milestones)

## Notification Types

| Type | Phase | Source Data | Dedupe Key |
|---|---|---|---|
| Bill Due | 1 | `generateDueDates()` in billStore | `bill_due:{billId}:{YYYY-MM-DD}` |
| Credit Payment Due | 1 | `CreditProfile.paymentDueDate` | `credit_payment_due:{accountId}:{date}` |
| Loan Payment Due | 1 | `LoanProfile.nextPaymentDate` | `loan_payment_due:{accountId}:{date}` |
| High Credit Utilization | 2 | `(creditLimit - availableCredit) / creditLimit` | `high_credit_util:{accountId}:{threshold}:{YYYY-MM}` |
| Budget Overspend | 2 | Budget amount vs. spending summary | `budget_overspend:{category}:{level}:{YYYY-MM}` |
| Large Transaction | 2 | Scheduler-based, last 7 days | `large_txn:{transactionId}` |
| Statement Reminder | 3 | Profile `periodEnd` + fallback day | `statement_reminder:{accountId}:{YYYY-MM}` |
| Milestones | 3 | `computeNetWorthSummary()`, loan `originalBalance` vs current | `milestone_nw:{amount}`, `milestone_payoff:{accountId}:{percent}` |

## Per-Type Configuration

| Type | Config Fields | Defaults |
|---|---|---|
| Bill Due | `reminderDaysBefore` | 3 |
| Credit Payment Due | `reminderDaysBefore` | 3 |
| Loan Payment Due | `reminderDaysBefore` | 3 |
| High Credit Utilization | `thresholds` (array of %) | [30, 70] |
| Budget Overspend | `warnAtPercent`, `alertAtPercent` | 80, 100 |
| Large Transaction | `threshold` ($) | 500 |
| Statement Reminder | `reminderDaysBefore`, `fallbackDayOfMonth` | 3, 28 |
| Milestones | `netWorthMilestones` ($[]), `loanPayoffPercentMilestones` (%[]) | [50k,100k,250k,500k,1M], [25,50,75,90,100] |

## Dependencies

- [03 — Account Management](03-account-management.md) — accounts and balances
- [08 — Bill Management](08-bill-management.md) — bill due date generation
- [PDF Statement Import](pdf-statement-import.md) — credit/loan profile data
