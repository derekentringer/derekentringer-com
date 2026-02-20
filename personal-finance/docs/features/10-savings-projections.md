# 10 — Savings Projections

**Status:** Complete
**Phase:** 5 — Projections & Planning
**Priority:** Medium

## Summary

Project savings and high-yield savings account growth over time based on current balances, monthly contributions, and APY. Per-account compound interest projections with adjustable parameters and milestone tracking.

## What Was Implemented

### Shared Package (`packages/shared/`)

- `SavingsProjectionPoint` — month, balance, principal, interest
- `SavingsAccountSummary` — accountId, accountName, accountType, currentBalance, apy, isFavorite, estimatedMonthlyContribution
- `SavingsProjectionResponse` — account summary, projection points, milestones array

### Finance API (`packages/finance-api/`)

#### Savings Projection (`src/store/projectionsStore.ts`)

`computeSavingsProjection({ accountId, months, contributionOverride?, apyOverride? })`:
- Fetches account and validates it's Savings or HighYieldSavings type
- Resolves APY: override > latest SavingsProfile APY > account.interestRate
- Resolves monthly contribution: override > estimated from 3-month positive transaction average
- Compounds monthly: `balance += (balance × monthlyRate) + contribution`
- Tracks cumulative principal and interest separately for stacked chart
- Generates dynamic milestones based on current balance:
  - < $1K: targets $1K, $5K, $10K
  - < $10K: targets $10K, $25K, $50K
  - < $100K: targets $25K, $50K, $100K
  - $100K+: targets $250K, $500K, $1M

`listSavingsAccounts()`:
- Lists all active savings/HYS accounts with APY and estimated contribution
- Parallelized per-account queries (avoids N+1)

#### API Routes (`src/routes/projections.ts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/projections/savings/accounts` | List savings/HYS accounts with summaries |
| GET | `/projections/savings/:accountId` | Per-account savings projection |

Query parameters for savings projection:
- `months` — projection timeframe (default 12)
- `contribution` — monthly contribution override
- `apy` — APY override

### Finance Web (`packages/finance-web/`)

#### Savings Tab (`src/components/projections/SavingsTab.tsx`)

Account list view:
- Shows all savings/HYS accounts as cards (via `SavingsProjectionCard`)
- Favorited accounts shown first
- Empty state with link to Accounts page

#### Savings Projection Card (`src/components/projections/SavingsProjectionCard.tsx`)

Per-account projection card with:
- **KPI row**: Current balance, APY, estimated monthly contribution
- **Stacked area chart**: Principal (violet) vs. Interest (green) over time
- **Time range selector**: 1yr / 2yr / 5yr / 10yr
- **Adjustable parameters**:
  - Monthly contribution slider + input (range 0 to max(5000, 2× current))
  - APY input with percentage formatting
  - Reference text showing 3-month average contribution
- **Milestones**: Checkmark icon for reachable targets, clock icon for "Beyond" timeframe targets
- **Debounced API calls**: 300ms debounce on parameter changes to avoid excessive requests

## Dependencies

- [03 — Account Management](03-account-management.md) — account balances and interest rates
- [PDF Statement Import](pdf-statement-import.md) — SavingsProfile data provides APY from statements

## Resolved Open Questions

- **Multiple HYS accounts**: Each account gets its own independent projection card with its own parameters
- **Expected withdrawals**: Not factored in — projections assume contributions only
- **Tax implications**: Not included
- **APY changes**: User can manually adjust APY via the parameter slider; projections use a constant rate
