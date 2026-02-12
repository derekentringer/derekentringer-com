# 04 — CSV Import System

**Status:** Not Started
**Phase:** 2 — Data Import
**Priority:** High

## Summary

Pluggable CSV parser architecture for importing transactions from bank exports. Supports Chase Checking, Chase Credit Card, and Amex HYS formats with auto-detection, deduplication, and review-before-commit workflow.

## Requirements

### Parser Architecture
- Pluggable parser system in `packages/api/src/csv-parsers/`:
  ```
  csv-parsers/
    chase-checking.ts
    chase-credit.ts
    amex-hys.ts
    index.ts          # parser registry
  ```
- Each parser implements a common interface:
  ```ts
  interface ParsedTransaction {
    date: Date
    description: string
    amount: number
    category?: string    // if bank provides one
    balance?: number     // if bank provides one
    type: 'credit' | 'debit'
  }
  ```
- Adding a new bank = write a parser that maps its CSV columns to the normalized format, register it in the index

### Known CSV Formats

**Chase Checking/Savings:**
```csv
Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
DEBIT,01/15/2026,"SPOTIFY",-15.99,ACH_DEBIT,4523.41,,
```

**Chase Credit Card:**
```csv
Transaction Date,Post Date,Description,Category,Type,Amount,Memo
01/15/2026,01/16/2026,"WHOLE FOODS",Groceries,Sale,-82.34,
```

**Amex HYS:**
- Simple format: date, description, amount, balance
- Exact column headers TBD — need a sample CSV with redacted numbers

### Import Flow
1. User selects an account (which has an assigned parser)
2. Upload a CSV file
3. Parser auto-detects format based on column headers (e.g., Chase checking vs. credit)
4. **Deduplication** — match on date + description + amount to avoid double-importing overlapping date ranges
5. Display parsed transactions for review, flag potential duplicates
6. User confirms, transactions are saved to the database

### API Endpoints
- `POST /accounts/:id/import` — upload CSV, returns parsed + deduplicated preview
- `POST /accounts/:id/import/confirm` — commit reviewed transactions to database

## Technical Considerations

- Use a streaming CSV parser (e.g., `csv-parse` or `papaparse`) for memory efficiency
- Date parsing must handle MM/DD/YYYY format from Chase CSVs
- Chase credit CSVs include a `Category` field — pass through to the Category Rule Engine (Feature 05)
- Chase checking CSVs do not include categories — rely on rule engine for categorization
- Deduplication key: `hash(date + description + amount)` — store hash on each transaction for fast lookup
- File upload via multipart form data on the API
- Max file size limit (e.g., 5MB)

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md)
- [01 — Auth & Security](01-auth-and-security.md)
- [02 — Database & Encryption](02-database-and-encryption.md)
- [03 — Account Management](03-account-management.md) — accounts must exist to import into

## Open Questions

- Exact Amex HYS CSV format — need a sample with redacted numbers
- Should auto-detection fall back to manual parser selection if headers don't match?
- Store the raw CSV file for audit/re-import, or only store parsed transactions?
- How to handle CSV encoding issues (UTF-8 BOM, etc.)?
