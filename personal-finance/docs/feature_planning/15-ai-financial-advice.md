# 15 — AI Financial Advice

**Status:** Not Started
**Phase:** 6 — Advanced Features
**Priority:** Medium

## Summary

Use the Claude API to analyze financial data and provide personalized recommendations based on current financial situation and longer-term goals.

## Requirements

- AI-powered financial analysis:
  - Summarize current financial health (income vs. expenses, debt-to-income ratio, savings rate)
  - Identify areas of concern (overspending categories, insufficient emergency fund, high-interest debt)
  - Suggest actionable next steps based on financial data
- Contextual advice:
  - "Based on your spending, you could save $300/month by reducing dining out"
  - "Your HYS is earning 4.5% but your car loan costs 6.8% — consider paying it off faster"
  - "You're on track to reach your house down payment goal 3 months early"
- Chat interface:
  - Ask questions about your finances in natural language
  - "How am I doing this month?"
  - "What should I prioritize: paying off my loan or building savings?"
  - "Show me my biggest spending changes compared to last month"
- Privacy controls:
  - Data sent to Claude API is your own financial data — user must explicitly opt in
  - Option to anonymize amounts (send ratios/percentages instead of dollar amounts)
  - Clear indication of what data is being sent

## Technical Considerations

- Claude API integration in `packages/api/` — server-side calls, not client-side
- Financial data is assembled into a structured prompt with context about accounts, transactions, budgets, goals
- Token cost management: summarize data before sending (don't dump raw transactions)
- Cache AI responses for identical data states to reduce API calls
- System prompt engineering: instruct Claude to give practical, specific advice, not generic financial wisdom
- Rate limiting on AI advice requests to manage costs

## Dependencies

- [07 — Budgeting & Expense Tracking](07-budgeting-expense-tracking.md) — needs spending data for analysis
- [08 — Bill Management](08-bill-management.md) — bills context for advice
- [09 — Net Income Projections](09-net-income-projections.md) — income context
- [12 — Financial Goal Planning](12-financial-goal-planning.md) — goals context for recommendations

## Open Questions

- Claude API cost at scale — how often would advice be requested?
- How much financial data context to include per request (token budget)?
- Disclaimer requirements ("AI-generated advice, not professional financial guidance")?
- Should advice be proactive (dashboard widget) or only on-demand (chat)?
