# 12 — Financial Goal Planning

**Status:** Complete
**Phase:** 5 — Projections & Planning
**Priority:** Medium

## Summary

Set and track financial goals with four goal types: savings, debt payoff, net worth, and custom milestone. Each goal has a progress bar, mini projection chart with optional history, on-track/at-risk status, and projected completion date. Goals are drag-and-drop reorderable and appear on both a dedicated Goals page and a dashboard summary card.

## What Was Implemented

### Shared Package (`packages/shared/`)

- `GoalType` — `"savings" | "debt_payoff" | "net_worth" | "custom"`
- `GOAL_TYPE_LABELS` — display names for each goal type
- `Goal` — id, name, type, targetAmount, currentAmount, targetDate, startDate, startAmount, priority, accountIds, extraPayment, monthlyContribution, notes, isActive, isCompleted, sortOrder, createdAt, updatedAt
- `CreateGoalRequest` — name, type, targetAmount required; optional currentAmount, targetDate, startDate, startAmount, priority, accountIds, extraPayment, monthlyContribution, notes
- `UpdateGoalRequest` — all fields optional, nullable fields support `null` to clear
- `GoalProgressPoint` — month, projected, actual (optional), target, minimumOnly (optional)
- `GoalProgress` — goalId, goalName, goalType, targetAmount, currentAmount, percentComplete, monthlyContribution, targetDate, projectedCompletionDate, onTrack, projection[]
- `GoalProgressResponse` — goals[], monthlySurplus, monthlyIncome, monthlyExpenses, monthlyDebtPayments
- `ReorderGoalsRequest` — order[] with id and sortOrder

### Finance API (`packages/finance-api/`)

#### Database Schema (`prisma/schema.prisma`)

Goal model with encrypted fields:
- `name`, `type` — encrypted strings
- `targetAmount`, `currentAmount`, `extraPayment`, `monthlyContribution`, `startAmount` — encrypted optional numbers (stored as encrypted text)
- `targetDate`, `startDate`, `notes` — encrypted optional strings
- `accountIds` — encrypted optional (JSON array stored as encrypted text)
- `priority`, `sortOrder` — plain integers
- `isActive`, `isCompleted` — plain booleans

Three migrations:
- `20260224000000_add_goals` — initial Goal table
- `20260225000000_add_goal_monthly_contribution` — add monthlyContribution column
- `20260225010000_add_goal_start_date` — add startDate, startAmount columns

#### Goal Store (`src/store/goalStore.ts`)

CRUD operations with Prisma + field-level encryption:
- `createGoal` — auto-assigns sortOrder (max + 1), encrypts, creates
- `getGoal` / `listGoals` — fetch + decrypt; listGoals supports `isActive` and `type` filters, ordered by sortOrder
- `updateGoal` — encrypt changed fields, update; returns null on not-found
- `deleteGoal` — hard delete; returns false on not-found
- `reorderGoals` — batched transaction updating sortOrder for each goal

#### Goal Progress Store (`src/store/goalProgressStore.ts`)

`computeGoalProgress({ months })` — main entry point:
1. Fetches active goals + computes monthly financial summary (income, expenses, debt minimums, savings contributions, net worth)
2. Dispatches per goal type to specialized compute functions
3. Returns `GoalProgressResponse` with per-goal progress and financial summary KPIs

Per-type progress computation:

**Savings goals** (`computeSavingsGoalProgress`):
- Links to savings accounts via accountIds
- Monthly contribution: user override (`goal.monthlyContribution`) > sum of linked account `estimatedMonthlyContribution`
- Current amount: manual override > linked account balances > estimated from startDate + contributions > startAmount > 0
- Projection: compound interest + contributions per linked account, or linear growth without linked accounts
- Projected completion: first month where projected >= targetAmount

**Debt payoff goals** (`computeDebtPayoffGoalProgress`):
- Links to debt accounts via accountIds
- Uses `computeDebtPayoffStrategy` (avalanche) for projection with extra payments
- Minimum-only baseline strategy for comparison
- Chart shows remaining balance decreasing toward $0 (not amount paid off increasing)
- Effective target: startAmount (original debt) > targetAmount > current remaining balance
- Progress bar: amount paid off (effectiveTarget - remainingBalance) / effectiveTarget

**Net worth goals** (`computeNetWorthGoalProgress`):
- Uses `computeAccountProjections` for detailed account-based net worth trajectory
- Falls back to linear projection with monthly surplus on error
- Current amount from net worth summary

**Custom milestone goals** (`computeCustomGoalProgress`):
- Monthly contribution from `goal.monthlyContribution`
- Current amount: manual override > estimated from startDate + contributions > startAmount > 0
- Linear projection with monthly contribution

**History prepending** (`prependHistory`):
- If goal has `startDate`, interpolates historical data points from startAmount to current value
- Sets `actual` field on historical points for colored chart rendering
- Ensures projection[0].projected matches currentValue for smooth transition
- Uses `parseLocalDate` for timezone-safe date parsing (avoids UTC midnight shift)

#### API Routes (`src/routes/goals.ts`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/goals` | List goals (optional `active` and `type` filters) |
| GET | `/goals/progress` | Computed progress for all active goals |
| GET | `/goals/:id` | Get single goal |
| POST | `/goals` | Create goal |
| PATCH | `/goals/:id` | Update goal |
| DELETE | `/goals/:id` | Delete goal (PIN-protected) |
| PUT | `/goals/reorder` | Reorder goals |

Query parameters for progress: `months` (12, 24, 36, 60, 120; default 60)

All routes require authentication. CUID format validation on ID params. Fastify JSON schema validation on create/update bodies.

#### Mappers (`src/lib/mappers.ts`)

- `decryptGoal` — decrypts all encrypted fields from Prisma row to Goal type
- `encryptGoalForCreate` — encrypts input fields for Prisma create
- `encryptGoalForUpdate` — encrypts changed fields, handles null-to-clear for optional fields

### Finance Web (`packages/finance-web/`)

#### Goals Page (`src/pages/GoalsPage.tsx`)

Full-page goal management with:
1. **KPI cards** (4 cards) — Monthly Income, Monthly Expenses, Monthly Surplus, Goals On Track; each with info icon tooltip
2. **Goal cards grid** — 2-column responsive grid of GoalProgressCards
3. **Drag-and-drop reordering** — @dnd-kit with `rectSortingStrategy`, optimistic sortOrder update
4. **CRUD dialogs** — GoalForm for create/edit, ConfirmDialog for delete
5. **Loading skeletons** — skeleton cards during initial load
6. **Error state** — retry button on failure

#### Goal Form (`src/components/GoalForm.tsx`)

Dialog-based form with conditional fields:
- Name, Type (select), Target Amount — always shown
- Start Date, Starting Amount — always shown (optional)
- Target Date, Priority — always shown
- Linked Accounts — shown for savings and debt_payoff types; checkboxes with account name and balance
- Extra Monthly Payment — shown for debt_payoff type
- Monthly Contribution — shown for savings and custom types
- Current Amount — shown for custom type
- Notes — always shown

Debt payoff auto-recalculation: on form load, if debt_payoff type with linked accounts, auto-sets targetAmount from sum of linked account balances.

Edit mode: only sends changed fields in UpdateGoalRequest; closes without API call if nothing changed.

#### Goal Progress Card (`src/components/goals/GoalProgressCard.tsx`)

Per-goal card with:
- **Header** — goal name, type badge (colored), status badge (Complete/On Track/At Risk/Off Track), drag handle, edit/delete buttons
- **Progress bar** — colored bar with current/target amounts and percentage
- **Mini chart** (Recharts AreaChart, 120px height) — unified rendering for all goal types:
  - Grey solid line for projection (`projected` data key)
  - Colored line + gradient fill for history (`actual` data key, where defined)
  - Reference dot at current position when no history
  - Dashed reference line at target (or $0 for debt payoff with "Paid Off" label)
  - Dashed minimum-only comparison line for debt payoff goals
  - Chart data thinned to max ~24 points; historical points always preserved
  - Chart trimmed to 3 months past projected completion date
- **Stats row** — Monthly contribution, Target Date, Projected completion, Progress amount

#### Dashboard Summary Card (`src/components/dashboard/GoalsSummaryCard.tsx`)

Compact card for dashboard page:
- Shows up to 5 active goals with name, type badge, progress bar, percentage, current amount, and estimated completion date
- "View all" link to Goals page
- "+N more goals" link when more than 5 goals
- Hidden when no goals exist (returns null)

#### API Client (`src/api/goals.ts`)

- `fetchGoals` / `fetchGoal` — list/get goals
- `createGoal` / `updateGoal` / `deleteGoal` — CRUD operations
- `reorderGoals` — PUT reorder
- `fetchGoalProgress` — computed progress with optional months param and AbortSignal support

### Global UI Updates

- **Sidebar** — added Goals link (Target icon) between Projections and Settings
- **App router** — added `/goals` route
- **Dashboard** — GoalsSummaryCard added to dashboard layout

### Tests

- `src/__tests__/goals.test.ts` — 27 tests: CRUD operations, validation (schema, ID format, goal type, targetAmount), reordering (valid, empty body), auth requirements
- `src/__tests__/goalMappers.test.ts` — encrypt/decrypt round-trip tests for all Goal fields including monthlyContribution, startDate, startAmount
- `src/__tests__/goalStore.test.ts` — store-level tests for create, list, update, delete, reorder with mock Prisma

## Dependencies

- [03 — Account Management](03-account-management.md) — goals linked to savings/debt accounts
- [06 — Net Worth Tracking](06-net-worth-tracking.md) — net worth goals use net worth summary
- [09 — Net Income Projections](09-net-income-projections.md) — monthly income/expense/surplus for KPIs
- [10 — Savings Projections](10-savings-projections.md) — savings account summaries for linked account progress
- [11 — Debt Payoff Planning](11-debt-payoff-planning.md) — debt payoff strategy computation for debt goals

## Resolved Open Questions

- **Competing goals**: Goals are independent; monthly surplus KPI helps users see total available allocation, but no automatic splitting
- **Automatic allocation suggestions**: Not implemented — users manually set monthly contribution per goal
- **Priority ranking**: Goals have a priority field and drag-and-drop sortOrder for display ordering
- **History tracking**: Users can set a start date and starting amount; the system interpolates historical progress from start to current value
- **Debt payoff progress**: Measured against original debt amount (startAmount), not current balance; chart shows remaining balance decreasing toward $0
