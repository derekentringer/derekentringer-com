# 04 — CSV Import System

**Status:** Complete
**Phase:** 2 — Data Import
**Priority:** High

> **Implementation details:** [features/04-csv-import-system.md](../features/04-csv-import-system.md)

## Summary

Pluggable CSV parser architecture for importing transactions from bank exports. Supports Chase Checking, Chase Credit Card, and Amex HYS formats with SHA-256 deduplication, auto-categorization via the rule engine, and a two-phase review-before-commit workflow. PIN verification required for import operations.

## Requirements

- Pluggable parser system with common interface (`RawParsedRow`)
- Chase Checking, Chase Credit Card, and Amex HYS parsers
- Two-phase import: preview (parse + deduplicate + auto-categorize) then confirm (encrypt + bulk insert)
- SHA-256 deduplication on `accountId + date + description + amount`
- File upload via `@fastify/multipart` (5MB limit, 1 file max)
- PIN verification on import endpoints
- Transaction listing with filters (account, category, date range) and pagination
- Transaction editing (category and notes fields)
- Client-side sortable table headers (date, description, amount, category, account)

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md)
- [01 — Auth & Security](01-auth-and-security.md)
- [02 — Database & Encryption](02-database-and-encryption.md)
- [03 — Account Management](03-account-management.md) — accounts must exist to import into

## Resolved Open Questions

- **Amex HYS format**: Placeholder parser implemented assuming `Date,Description,Amount,Balance` columns
- **Parser selection**: Account has a `csvParserId` field; override available via query parameter on upload
- **CSV encoding**: BOM stripping handled in `csvUtils.ts`
- **Deduplication strategy**: SHA-256 hash stored as `dedupeHash` on Transaction model with unique constraint per account
- **Category assignment**: Auto-categorized via rule engine during preview; user can edit categories inline before confirming
