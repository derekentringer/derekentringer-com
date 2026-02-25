# 14 — Financial Decision Tools

**Status:** Complete (partial — 2 of 4 calculators implemented)
**Phase:** 6 — Advanced Features
**Priority:** Medium

## Summary

Interactive calculators for common financial decisions: "Should I keep $100k in HYS or pay off loans?", "How much should I put in my 401k?", opportunity cost comparisons, and more.

## Requirements

- **HYS vs. Debt Payoff Calculator**: **Implemented**
  - Input: HYS balance, HYS APY, loan balance, loan APR, monthly payment
  - Compare: interest earned on HYS vs. interest paid on loan
  - Output: net benefit of each approach, break-even point
  - Factor in: tax on interest income, loan interest tax deduction (if applicable)
- **401k Contribution Optimizer**: **Implemented**
  - Input: salary, current contribution %, employer match %, match cap
  - Show: "You're leaving $X/year of free money on the table"
  - Optimize: contribute at least up to employer match, then compare Roth vs. Traditional
- **Emergency Fund Calculator**: **Deferred**
  - Input: monthly expenses
  - Output: recommended 3/6/12 month emergency fund targets
  - Show: current progress toward each target
- **Opportunity Cost Comparisons**: **Deferred**
  - Generic "invest $X at Y% vs. do Z" calculator
  - Time value of money calculations

## Technical Considerations

- Calculators are primarily frontend logic (compute in the browser, no API calls needed)
- Could share calculation functions in `packages/shared/` for use in mobile app too
- Pre-populate inputs from actual account data where possible (pull HYS balance, loan rates, etc.)
- Results should be visual: charts showing outcomes over time, not just numbers

## Dependencies

- [03 — Account Management](03-account-management.md) — for pre-populating account data into calculators

## Open Questions

- Should results be saveable/shareable, or ephemeral?
- Include a generic "compound interest calculator" as a catch-all?
