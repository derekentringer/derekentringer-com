# 13 — Investment Portfolio Analysis

**Status:** Complete (see [features/13-investment-portfolio-analysis.md](../features/13-investment-portfolio-analysis.md))
**Phase:** 6 — Advanced Features
**Priority:** Medium

## Summary

Track investment portfolio allocation, performance, and rebalancing needs. Provide visibility into how investments contribute to overall net worth.

## Requirements

- Portfolio holdings:
  - Add individual holdings (stock/ETF/fund ticker, shares, cost basis)
  - Or track at the account level (total value of 401k, IRA, brokerage)
- Asset allocation view:
  - Breakdown by asset class (stocks, bonds, real estate, cash, crypto)
  - Pie chart of current allocation
  - Compare to target allocation
- Performance tracking:
  - Total return (dollar and percentage)
  - Time-weighted returns over periods (1M, 3M, 6M, 1Y, YTD, all time)
  - Benchmark comparison (e.g., vs. S&P 500)
- Rebalancing suggestions:
  - Define target allocation percentages
  - Show drift from target
  - Suggest trades to rebalance
- Contribution tracking: how much has been contributed vs. how much is market growth

## Technical Considerations

- Market data: could use a free API (e.g., Yahoo Finance, Alpha Vantage) for current prices, or manual entry
- If manual entry: user periodically updates account values (like updating a spreadsheet)
- If API-based: rate limits and reliability of free tiers are a concern
- Cost basis tracking is complex (FIFO, LIFO, specific lot) — consider simplifying to average cost basis
- Investment accounts also feed into Net Worth Tracking (Feature 06)

## Dependencies

- [03 — Account Management](03-account-management.md) — investment accounts
- [06 — Net Worth Tracking](06-net-worth-tracking.md) — investments contribute to net worth

## Open Questions

- Manual value entry vs. market data API — which approach?
- How granular: individual holdings with tickers, or account-level totals only?
- Tax-lot tracking for capital gains, or out of scope?
- How to handle 401k where holdings may not be standard tickers (employer-specific funds)?
