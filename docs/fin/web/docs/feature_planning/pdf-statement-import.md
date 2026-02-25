# PDF Statement Import & Account Profiles

**Status:** Complete (see [features/pdf-statement-import.md](../features/pdf-statement-import.md))
**Phase:** 3 — Statement Import & Profiles
**Priority:** High

## Summary

AI-powered PDF statement import with account-type-specific profile extraction. Uses the Claude API to parse financial statements and extract structured data including balances, dates, and type-specific details (loan terms, investment returns, savings APY). Includes a Fidelity 401(k) CSV parser and schema extensions for account-type profiles.

## Requirements

- PDF file upload via `@fastify/multipart` (5MB limit)
- AI-powered extraction using Claude API with account-type-aware prompts and tool schemas
- Account-type-specific profile data:
  - **Loan**: Interest rate, payment breakdown, remaining term, origination details
  - **Investment**: Returns, contributions, employer match, vesting, fees, dividends, holdings
  - **Savings/HYS**: APY, interest earned, YTD interest
- Two-phase workflow: preview (extract + display for review) then confirm (encrypt + save atomically)
- Duplicate detection: check for existing balance on same calendar day
- Optional account updates: current balance and interest rate
- Raw text snippets preserved for user verification of AI extraction
- Fidelity 401(k) CSV parser for transaction imports
- Prisma schema extensions: LoanProfile, InvestmentProfile, SavingsProfile models; Account static loan fields

## Dependencies

- [02 — Database & Encryption](02-database-and-encryption.md) — needs schema and encryption utilities
- [03 — Account Management](03-account-management.md) — accounts must exist to import into
- [01 — Auth & Security](01-auth-and-security.md) — PIN verification for import operations

## Resolved Open Questions

- **PDF parsing approach**: AI-powered extraction via Claude API — handles any statement format without per-institution parsers
- **Account-type profiles**: Separate profile models as 1:1 relations on Balance
- **Duplicate detection**: Calendar day matching per account
- **Interest rate updates**: Optional, user-controlled
- **Fidelity 401(k)**: CSV parser added alongside PDF import; parses Transaction Date, Investment, Contribution, Description, Activity, Price, Units, Amount columns
- **PII in API calls**: Account numbers, SSNs, and credit card numbers are redacted from extracted text before sending to the Anthropic API; dollar amounts, dates, and percentages are preserved for extraction
