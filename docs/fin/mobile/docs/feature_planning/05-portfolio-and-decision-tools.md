# Phase 5 — Portfolio & Decision Tools

**Status:** Complete (v1.23.0)
**Priority:** Medium

## Summary

Investment portfolio management and financial calculators (HYS vs Debt Payoff, 401k Optimizer).

## Screens

- `PortfolioScreen` — top tabs: Holdings, Allocation, Performance, Rebalance
- `HoldingDetailScreen`, `CreateHoldingScreen`, `EditHoldingScreen`
- `DecisionToolsScreen` — top tabs: HYS vs Debt, 401k Optimizer

## Components

- `src/components/portfolio/HoldingRow.tsx`, `AllocationPieChart.tsx`, `PerformanceChart.tsx`, `RebalanceRow.tsx`
- `src/components/decision-tools/ScenarioChart.tsx`, `RecommendationCard.tsx`
- `src/components/common/AccountPicker.tsx`

## Hooks

`src/hooks/usePortfolio.ts`:
- `useHoldings`, `useHolding`, `useCreateHolding`, `useUpdateHolding`, `useDeleteHolding`, `useAssetAllocation`, `useTargetAllocations`, `usePerformance`, `useRebalanceSuggestions`, `useQuote`

## Local Computation

- `src/lib/calculations.ts` — decision tool calculators (HYS vs Debt, 401k) are frontend-only, matching web's `decisionCalculators.ts`
- `src/lib/formatters.ts` — currency, date, percentage formatting

## Verification

- Holdings CRUD with live pricing
- Allocation pie chart with target comparison
- Performance chart with benchmark
- Rebalance suggestions display correctly
- Decision tool calculators produce correct results

## Dependencies

- [Phase 4 — Goals & Projections](04-goals-and-projections.md)
