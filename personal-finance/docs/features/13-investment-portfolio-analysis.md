# 13 — Investment Portfolio Analysis

**Status:** Complete
**Phase:** 6 — Advanced Features
**Priority:** Medium

## Summary

Track investment portfolio holdings with live pricing, asset allocation visualization, performance benchmarking against SPY, and rebalancing suggestions. Holdings are managed per investment account with Finnhub-powered daily price updates, encrypted storage, and a four-tab investments page (Overview, Holdings, Allocation, Performance).

## What Was Implemented

### Shared Package (`packages/shared/`)

**Types (`src/finance/types.ts`):**

- `AssetClass` — `"stocks" | "bonds" | "real_estate" | "cash" | "crypto" | "other"`
- `ASSET_CLASSES`, `ASSET_CLASS_LABELS` — enum values and display labels
- `CASH_ACCOUNT_TYPES` — `[Savings, HighYieldSavings]` for portfolio cash inclusion
- `Holding` — id, accountId, name, ticker, shares, costBasis, currentPrice, assetClass, notes, sortOrder, marketValue, gainLoss, gainLossPct, createdAt, updatedAt
- `CreateHoldingRequest`, `UpdateHoldingRequest`, `ReorderHoldingsRequest`
- `TargetAllocation` — id, accountId (null = global), assetClass, targetPct
- `SetTargetAllocationsRequest`, `TargetAllocationListResponse`
- `AssetAllocationSlice` — assetClass, label, marketValue, percentage, targetPct, drift
- `AssetAllocationResponse` — slices[], totalMarketValue
- `PerformancePeriod` — `"1m" | "3m" | "6m" | "12m" | "all"` (differs from `ChartTimeRange` which includes `"ytd"`)
- `PerformancePoint` — date, portfolioValue, benchmarkValue
- `PerformanceSummary` — totalValue, totalCost, totalReturn, totalReturnPct, benchmarkReturnPct
- `PerformanceResponse` — summary, series[], period
- `RebalanceSuggestion` — assetClass, label, currentPct, targetPct, drift, action (buy/sell/hold), amount
- `RebalanceResponse` — suggestions[], totalMarketValue
- `QuoteResponse` — ticker, currentPrice, change, changePercent, high, low, open, previousClose
- `isCashAccountType(type)` — helper to check if an account type is a cash type

### Finance API (`packages/finance-api/`)

#### Database Schema (`prisma/schema.prisma`)

Four new models:

```prisma
model Holding {
  id           String   @id @default(cuid())
  accountId    String
  name         String          // encrypted
  ticker       String?
  shares       String?         // encrypted number
  costBasis    String?         // encrypted number
  currentPrice String?         // encrypted number
  assetClass   String
  notes        String?         // encrypted
  sortOrder    Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  account      Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  @@index([accountId])
  @@index([assetClass])
  @@map("holdings")
}

model TargetAllocation {
  id         String   @id @default(cuid())
  accountId  String?          // null = global allocation
  assetClass String
  targetPct  String           // encrypted number (0-100)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@unique([accountId, assetClass])
  @@map("target_allocations")
}

model PriceHistory {
  id        String   @id @default(cuid())
  ticker    String
  price     String           // encrypted number
  date      DateTime
  source    String           // "finnhub"
  createdAt DateTime @default(now())
  @@unique([ticker, date])
  @@map("price_history")
}

model BenchmarkHistory {
  id        String   @id @default(cuid())
  symbol    String           // "SPY"
  price     String           // encrypted number
  date      DateTime
  createdAt DateTime @default(now())
  @@unique([symbol, date])
  @@map("benchmark_history")
}
```

Migration: `20260225020000_add_holdings`

#### Holding Store (`src/store/holdingStore.ts`)

- `createHolding(data)` — encrypt and create with auto-assigned sortOrder
- `getHolding(id)` — fetch and decrypt single holding
- `listHoldings(accountId)` — list by account, ordered by sortOrder
- `updateHolding(id, data)` — partial update with P2025 error handling
- `deleteHolding(id)` — delete with error handling
- `reorderHoldings(order)` — batch update sortOrder in transaction
- `updateHoldingPrice(id, price)` — convenience for price scheduler updates
- `listAllHoldingsWithTickers()` — all holdings with tickers (used by price scheduler)

#### Target Allocation Store (`src/store/targetAllocationStore.ts`)

- `setTargetAllocations(accountId, allocations[])` — transaction: delete old, create new (scoped per-account or global)
- `listTargetAllocations(accountId?)` — fetch by scope with decryption

#### Price History Store (`src/store/priceHistoryStore.ts`)

- `upsertPriceHistory(ticker, price, date, source)` — daily price snapshots (deduped by ticker+date)
- `getPriceHistory(ticker, startDate, endDate)` — fetch price range for performance charts
- `upsertBenchmarkHistory(symbol, price, date)` — SPY benchmark prices
- `getBenchmarkHistory(symbol, startDate, endDate)` — fetch benchmark range

#### Account Store (`src/store/accountStore.ts`)

- `getCashBalance()` — lightweight query: only selects `currentBalance` from active savings/HYS accounts, avoids decrypting all account fields

#### Portfolio Store (`src/store/portfolioStore.ts`)

- `computeAssetAllocation(accountId?)` — groups holdings by asset class, includes savings/HYS cash for portfolio-wide queries, compares against targets
- `computePerformance(period, accountId?)` — builds performance series from price history, parallelized price+benchmark fetches via `Promise.all`, savings included in summary `totalValue` and `totalCost` (zero return contribution) but excluded from historical series
- `computeRebalanceSuggestions(accountId?)` — drift-based buy/sell/hold suggestions with dollar amounts

#### Finnhub Client (`src/lib/finnhub.ts`)

- `fetchQuote(ticker)` — fetches live quote from Finnhub REST API
- Returns current price, change, change percent, high, low, open, previous close
- Throws on missing API key or zero-value response

#### Price Fetch Scheduler (`src/lib/priceFetchScheduler.ts`)

- Runs once per day after configurable ET hour (default: 18:00, via `PRICE_FETCH_HOUR`)
- Checks every 1 hour, initial run 30 seconds after startup
- Fetches all holdings with tickers via Finnhub (1.1s rate limit between calls)
- Updates holding `currentPrice` and records daily `PriceHistory` snapshots
- Fetches SPY benchmark separately, records to `BenchmarkHistory`
- Updates account `currentBalance` = sum of holding market values per account
- Per-ticker error handling (skip failures, continue)
- Started/stopped via `app.ts` lifecycle hooks

#### API Routes

**Holdings (`src/routes/holdings.ts`):**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/holdings` | List holdings by `accountId` query param |
| GET | `/holdings/:id` | Get single holding |
| POST | `/holdings` | Create holding (validates investment account type) |
| PATCH | `/holdings/:id` | Update holding |
| DELETE | `/holdings/:id` | Delete holding |
| PUT | `/holdings/reorder` | Reorder holdings |
| GET | `/holdings/quote/:ticker` | Live quote from Finnhub |

**Portfolio (`src/routes/portfolio.ts`):**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/portfolio/allocation` | Current asset allocation breakdown |
| GET | `/portfolio/target-allocations` | Retrieve target allocations |
| PUT | `/portfolio/target-allocations` | Set targets (validates sum = 100%) |
| GET | `/portfolio/performance` | Performance over period (default 12m) |
| GET | `/portfolio/rebalance` | Rebalancing suggestions |

#### Config (`src/config.ts`)

- `finnhubApiKey` — Finnhub API key (optional; price fetching disabled if missing)
- `priceFetchHour` — ET hour to trigger daily fetch (default: 18)

#### Mappers (`src/lib/mappers.ts`)

- `encryptHoldingForCreate()`, `encryptHoldingForUpdate()`, `decryptHolding()` — holding encryption/decryption
- `encryptTargetAllocationForCreate()`, `decryptTargetAllocation()` — target allocation encryption/decryption
- `decryptPriceHistory()` — price history decryption

#### Tests

- `src/__tests__/holdingStore.test.ts` — 15 tests: CRUD operations, encryption round-trips, sortOrder assignment, P2025 handling
- `src/__tests__/holdingMappers.test.ts` — 10 tests: encrypt/decrypt for holdings with nullable fields
- `src/__tests__/holdings.test.ts` — 26 tests: integration tests for holding routes (auth, validation, CRUD, quote endpoint)
- `src/__tests__/portfolioStore.test.ts` — 8 tests: asset allocation with/without cash, performance summary with savings in totalCost, historical series excludes savings, account-specific queries, rebalance suggestions

### Finance Web (`packages/finance-web/`)

#### API Clients

**`src/api/holdings.ts`:**
- `fetchHoldings(accountId)`, `fetchHolding(id)`, `createHolding(data)`, `updateHolding(id, data)`, `deleteHolding(id)`, `reorderHoldings(data)`, `fetchQuote(ticker)`

**`src/api/portfolio.ts`:**
- `fetchAssetAllocation(accountId?)`, `fetchTargetAllocations(accountId?)`, `setTargetAllocations(data)`, `fetchPerformance(period?, accountId?)`, `fetchRebalanceSuggestions(accountId?)`

#### Holdings Components

**`src/components/holdings/HoldingForm.tsx`:**
- Dialog form for create/edit holdings
- Fields: Account selector, Name, Ticker, Shares, Cost Basis (per share), Current Price, Asset Class, Notes
- "Fetch" button for live Finnhub quote
- Validates required fields (name, asset class)

**`src/components/holdings/HoldingsTable.tsx`:**
- Sortable data table: Name, Ticker, Shares, Cost Basis, Current Price, Market Value, Gain/Loss ($ + %), Asset Class, Actions
- Inline refresh price button per row
- Summary row with totals for Market Value and Gain/Loss
- Edit/delete action buttons

#### Portfolio Components

**`src/components/portfolio/AllocationChart.tsx`:**
- Donut chart (180x180) with legend
- Shows current %, target %, drift % per asset class
- Color coded by category, tooltips with market values

**`src/components/portfolio/PerformanceSummary.tsx`:**
- KPI cards: Total Value, Total Return ($), Total Return (%), Benchmark (SPY)
- Trend indicators on return cards
- Benchmark card conditionally rendered when data available

**`src/components/portfolio/PerformanceChart.tsx`:**
- Area chart: portfolio vs. SPY benchmark over time
- Period selector: 1M, 3M, 6M, 12M, ALL
- Custom tooltip, empty state handling

**`src/components/portfolio/TargetAllocationForm.tsx`:**
- Modal dialog to set target allocations per account or globally
- Preset buttons: Aggressive (85/5/5), Moderate (60/30/10), Conservative (40/40/20)
- Live sum validation (must equal 100%)

**`src/components/portfolio/RebalanceCard.tsx`:**
- Suggestions table: Asset Class, Current %, Target %, Drift %, Action (Buy/Sell/Hold badge), Amount ($)
- Color-coded drift: < 1% green, 1–5% yellow, > 5% red

#### Page Integration (`src/pages/AccountTypePage.tsx`)

Investments page with 4 tabs:
- **Overview** — KPI cards (YTD Return, Contributions, Balance, Dividends) with sparklines
- **Holdings** — Account selector, holdings table with add/edit/delete/refresh
- **Allocation** — Allocation chart + target form + rebalance suggestions
- **Performance** — Period selector, performance summary KPIs, performance chart, rebalance card

#### Routes (`src/App.tsx`)

- `<Route path="accounts/:typeSlug/:tab?" element={<AccountTypePage />} />`

## Files Created

| File | Description |
|------|-------------|
| `packages/finance-api/prisma/migrations/20260225020000_add_holdings/` | Migration SQL for 4 new models |
| `packages/finance-api/src/store/holdingStore.ts` | Holding CRUD with encryption |
| `packages/finance-api/src/store/targetAllocationStore.ts` | Target allocation management |
| `packages/finance-api/src/store/priceHistoryStore.ts` | Price history + benchmark storage |
| `packages/finance-api/src/store/portfolioStore.ts` | Asset allocation, performance, rebalancing |
| `packages/finance-api/src/routes/holdings.ts` | Holdings API routes |
| `packages/finance-api/src/routes/portfolio.ts` | Portfolio analysis API routes |
| `packages/finance-api/src/lib/finnhub.ts` | Finnhub API client |
| `packages/finance-api/src/lib/priceFetchScheduler.ts` | Daily automated price fetching |
| `packages/finance-api/src/__tests__/holdingStore.test.ts` | Holding store unit tests |
| `packages/finance-api/src/__tests__/holdingMappers.test.ts` | Holding mapper tests |
| `packages/finance-api/src/__tests__/holdings.test.ts` | Holdings route integration tests |
| `packages/finance-api/src/__tests__/portfolioStore.test.ts` | Portfolio store unit tests |
| `packages/finance-web/src/api/holdings.ts` | Frontend holdings API client |
| `packages/finance-web/src/api/portfolio.ts` | Frontend portfolio API client |
| `packages/finance-web/src/components/holdings/HoldingForm.tsx` | Holding create/edit dialog |
| `packages/finance-web/src/components/holdings/HoldingsTable.tsx` | Holdings data table |
| `packages/finance-web/src/components/portfolio/AllocationChart.tsx` | Asset allocation donut chart |
| `packages/finance-web/src/components/portfolio/PerformanceSummary.tsx` | Performance KPI cards |
| `packages/finance-web/src/components/portfolio/PerformanceChart.tsx` | Portfolio vs. benchmark chart |
| `packages/finance-web/src/components/portfolio/TargetAllocationForm.tsx` | Target allocation dialog |
| `packages/finance-web/src/components/portfolio/RebalanceCard.tsx` | Rebalancing suggestions |

## Files Modified

| File | Changes |
|------|---------|
| `packages/shared/src/finance/types.ts` | AssetClass, Holding, TargetAllocation, Performance, Rebalance types, `isCashAccountType()` helper |
| `packages/shared/src/index.ts` | Re-export new types and helpers |
| `packages/finance-api/prisma/schema.prisma` | 4 new models + Account relation |
| `packages/finance-api/src/app.ts` | Register holding/portfolio routes, start/stop price scheduler |
| `packages/finance-api/src/config.ts` | Finnhub API key, price fetch hour config |
| `packages/finance-api/src/lib/mappers.ts` | Holding, target allocation, price history encrypt/decrypt |
| `packages/finance-api/src/store/accountStore.ts` | `getCashBalance()` lightweight query |
| `packages/finance-api/src/__tests__/helpers/mockPrisma.ts` | Added holding, targetAllocation, priceHistory, benchmarkHistory mock models |
| `packages/finance-web/src/App.tsx` | Account type page route |
| `packages/finance-web/src/pages/AccountTypePage.tsx` | 4-tab investments page with holdings, allocation, performance |

## Dependencies Added

| Package | Where | Purpose |
|---------|-------|---------|
| (none) | | Finnhub uses standard `fetch()` — no additional dependencies |

## Environment Variables

### Finance API

| Variable | Required | Description |
|----------|----------|-------------|
| `FINNHUB_API_KEY` | No | Finnhub API key; price fetching disabled if missing |
| `PRICE_FETCH_HOUR` | No | ET hour to trigger daily price fetch (default: 18) |

## Design Decisions

- **Finnhub for market data** — Free tier with 60 req/min; 1.1s rate limiting between calls handles typical portfolio sizes. No additional npm dependency (uses native `fetch`).
- **Daily price snapshots** — Scheduler stores one price per ticker per day in `PriceHistory`, enabling historical performance charts without re-fetching.
- **SPY benchmark** — SPDR S&P 500 ETF as the standard benchmark for portfolio comparison. Stored separately in `BenchmarkHistory` table.
- **Encrypted numeric fields** — All financial values (shares, prices, balances) encrypted at rest with AES-256-GCM, consistent with the rest of the application.
- **Portfolio-wide cash inclusion** — For portfolio-wide queries, savings/HYS account balances are included as a "cash" asset class in allocation and in performance summary `totalValue`/`totalCost`. Cash contributes zero return (added equally to value and cost). Historical performance series exclude cash to show investment-only performance.
- **Parallelized price fetches** — `computePerformance` fetches all ticker price histories and the SPY benchmark in parallel via `Promise.all` for better latency.
- **Lightweight `getCashBalance()`** — Dedicated query selects only `currentBalance` from savings/HYS accounts instead of fetching and decrypting all account fields.
- **Global vs. per-account targets** — Target allocations can be set globally (accountId = null) or per investment account. Allocation sum must equal 100%.
- **Average cost basis** — Simplified to average cost per share rather than FIFO/LIFO/specific lot tracking.
- **Account balance sync** — Price scheduler updates account `currentBalance` to sum of holding market values, keeping net worth dashboard in sync with live prices.

## Resolved Open Questions

- **Manual vs. API pricing**: Finnhub API with daily scheduled fetching; manual entry also supported for holdings without tickers
- **Granularity**: Individual holdings with tickers, plus support for account-level totals (holdings without tickers carry static market values)
- **Tax-lot tracking**: Out of scope — using average cost basis for simplicity
- **Employer-specific funds**: Holdings without standard tickers are supported (no ticker field required); market value tracked manually or via PDF statement import
