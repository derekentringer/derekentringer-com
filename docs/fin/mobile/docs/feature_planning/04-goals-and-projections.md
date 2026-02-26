# Phase 4 — Goals & Projections

**Status:** Complete (moved to [features/04-goals-and-projections.md](../features/04-goals-and-projections.md))
**Priority:** Medium

## Summary

Goal tracking with progress and projection charts (net income, savings, debt payoff).

## Screens

- `GoalsScreen` — goal list with progress bars, on-track indicators, reorder mode (up/down arrows)
- `GoalDetailScreen`, `CreateGoalScreen`, `EditGoalScreen`
- `ProjectionsScreen` — top tabs: Net Income, Savings, Debt Payoff; each with chart + controls

## Components

- `src/components/goals/GoalCard.tsx`, `GoalProjectionChart.tsx`
- `src/components/projections/ProjectionChart.tsx`, `StrategyPicker.tsx`
- `src/components/common/SegmentedControl.tsx`, `Slider.tsx`

## Hooks

`src/hooks/useGoals.ts`:
- `useGoals`, `useGoalProgress`, `useCreateGoal`, `useUpdateGoal`, `useDeleteGoal`, `useReorderGoals`

`src/hooks/useProjections.ts`:
- `useNetIncomeProjection`, `useAccountProjections`, `useSavingsAccounts`, `useSavingsProjection`, `useDebtAccounts`, `useDebtPayoff`

## Verification

- Goal list with progress bars and on-track/at-risk badges
- Goal reorder via up/down arrows
- Projection charts render with correct data
- Strategy picker updates projection calculations

## Dependencies

- [Phase 3 — Bills & Budgets](03-bills-and-budgets.md)
