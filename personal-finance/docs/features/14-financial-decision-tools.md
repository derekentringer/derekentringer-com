# 14 — Financial Decision Tools

**Status:** Complete
**Phase:** 6 — Advanced Features
**Priority:** Medium

## Summary

Interactive financial calculators for common decisions: "Should I keep savings in HYS or pay off a loan?" and "How much should I contribute to my 401(k)?" Two calculators on a tab-routed Decision Tools page. All computation is frontend-only (no API endpoints). Inputs pre-populate from existing account data and income sources, and persist to localStorage. All KPI cards include info icon tooltips explaining each metric.

## What Was Implemented

### Shared Package (`packages/shared/`)

**Types (`src/finance/types.ts`):**

- `HysVsDebtInputs` — hysBalance, hysApy, loanBalance, loanApr, monthlyPayment, optional account IDs
- `HysVsDebtMonthPoint` — month, label, scenario A/B balances and net positions
- `HysVsDebtResult` — schedule, interest totals, netBenefit, breakEvenMonth, recommendation
- `FourOhOneKInputs` — annualSalary, currentContributionPct, employerMatchPct, employerMatchCapPct, expectedAnnualReturnPct, currentBalance, optional account ID
- `FourOhOneKYearPoint` — year, label, current/optimal/max balances
- `FourOhOneKResult` — contributions, matches, optimal %, moneyLeftOnTable, 30-year projection

### Finance Web (`packages/finance-web/`)

#### Calculation Functions (`src/lib/decisionCalculators.ts`)

- `calculateHysVsDebt(inputs)` — Runs two scenarios (keep HYS vs. use HYS to pay down loan) up to 360 months, tracking compound interest earned/paid, net position, break-even month, and recommendation
- `calculateFourOhOneK(inputs)` — Calculates current/optimal/IRS-max employer match and contribution, projects 30-year growth at three contribution levels, identifies money left on table

#### Unit Tests (`src/lib/__tests__/decisionCalculators.test.ts`)

- HYS vs. Debt: APR > APY recommends pay-loan, APY > APR recommends keep-HYS, HYS > loan balance, zero balances, break-even correctness, cumulative interest tracking
- 401(k): basic match calculation, at-optimal (zero left on table), above-cap, zero salary, 30-year projection accuracy, IRS limit capping

#### Page & Routing

- `DecisionToolsPage.tsx` — Tab-routed page with "HYS vs. Debt" and "401(k) Optimizer" tabs
- Route: `decision-tools/:tab?` added to `App.tsx`
- Sidebar entry with `Calculator` icon from lucide-react, placed after Reports

#### HYS vs. Debt Payoff Calculator

- `HysVsDebtTab.tsx` — Fetches savings + loan accounts, account dropdowns with "Manual Entry" option, pre-populates from selected accounts' balances and profiles (balance, APY, APR, monthly payment)
- `HysVsDebtCalculator.tsx` — 5 input fields, 300ms debounced recalculation, localStorage persistence, Reset button, 4 KPI cards with info tooltips:
  - **Recommendation** — "Keep HYS" or "Pay Down Loan" with contextual explanation
  - **Net Benefit** — dollar difference in final net position between scenarios
  - **Break-Even** — month when paying down loan starts outperforming keeping HYS
  - **Interest Delta** — difference in net interest (earned minus paid) between scenarios
- `HysVsDebtChart.tsx` — LineChart with two scenario lines (amber = Keep HYS, green = Pay Down Loan), dashed break-even reference line

#### 401(k) Contribution Optimizer

- `FourOhOneKTab.tsx` — Fetches investment accounts and active income sources in parallel; estimates annual salary from income sources (frequency-aware: weekly x52, biweekly x26, monthly x12, etc.); pre-populates balance and return rate from account profiles
- `FourOhOneKCalculator.tsx` — 6 input fields with range slider for contribution %, 300ms debounced recalculation, localStorage persistence, Reset button, 4 KPI cards with info tooltips:
  - **Annual Contribution** — your annual contribution amount, capped at IRS limit
  - **Employer Match** — annual match received (free money from employer)
  - **Left on Table** — employer match you're missing by contributing below match cap
  - **Optimal %** — minimum contribution percentage to maximize employer match
- `FourOhOneKChart.tsx` — AreaChart with gradient fills for three projection lines (blue = Current, green = Optimal, violet = IRS Max)

#### Chart Theme (`src/lib/chartTheme.ts`)

5 new color constants: `scenarioA` (amber), `scenarioB` (green), `fourOhOneKCurrent` (blue), `fourOhOneKOptimal` (green), `fourOhOneKMax` (violet)

## Key Decisions

- **Frontend-only computation** — No API endpoints needed; pure functions run in the browser
- **localStorage persistence** — Calculator inputs survive page reloads; "Reset to Defaults" clears storage and re-populates from account data
- **Account pre-population** — Savings/HYS accounts filtered using `isCashAccountType()`, loans filtered by `type === "loan"`, investment accounts fetched by type; balance profiles provide APY, APR, monthly payment, and rate of return
- **Income-based salary estimation** — 401(k) optimizer fetches active income sources and sums them (frequency-adjusted) to estimate annual salary rather than using a hardcoded default
- **Info tooltips on all KPI cards** — Each metric has an info icon explaining what it means and how to interpret it
- **IRS 401(k) limit** — Hardcoded at $23,500 (2024 limit); contributions capped at this amount
- **Debounced recalculation** — 300ms delay prevents excessive computation during rapid input changes

## Deferred

- **Emergency Fund Calculator** — 3/6/12 month target recommendations with current progress
- **Opportunity Cost Comparisons** — Generic "invest $X at Y% vs. do Z" calculator
