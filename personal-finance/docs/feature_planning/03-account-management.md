# 03 — Account Management

**Status:** Not Started
**Phase:** 1 — Foundation
**Priority:** High

## Summary

Manually add, edit, and delete financial accounts (checking, savings, HYS, credit cards, loans) with current balances. This is the core data model that all other features build on.

## Requirements

- CRUD operations for financial accounts:
  - **Create** — add a new account with name, type, institution, current balance, and assigned CSV parser
  - **Read** — list all accounts, view individual account details
  - **Update** — edit account name, balance, parser assignment, etc.
  - **Delete** — remove an account and optionally its transactions
- Supported account types:
  - Checking
  - Savings
  - High-Yield Savings (HYS)
  - Credit Card
  - Loan (mortgage, auto, student, personal)
  - Investment (for Phase 5)
- Each account stores:
  - Name (e.g., "Chase Checking", "Amex HYS")
  - Type (enum from above)
  - Institution (e.g., "Chase", "Amex")
  - Current balance (encrypted at rest)
  - Account number (optional, encrypted at rest)
  - Interest rate (for HYS and loans)
  - CSV parser identifier (e.g., `chase-checking`, `amex-hys`)
  - Active/inactive flag
- API endpoints:
  - `GET /accounts` — list all
  - `GET /accounts/:id` — single account
  - `POST /accounts` — create
  - `PUT /accounts/:id` — update
  - `DELETE /accounts/:id` — delete
- Web UI: simple form to add/edit accounts, table/card view to list them

## Technical Considerations

- Balances and account numbers pass through the encryption layer from Feature 02
- Account type determines behavior in other features (loans have payoff calculations, HYS has interest projections)
- Parser assignment links to the CSV Import System (Feature 04) — store parser ID as a string field
- Fastify schema validation on all endpoints (request body, params, response)

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md)
- [01 — Auth & Security](01-auth-and-security.md) — all endpoints require auth
- [02 — Database & Encryption](02-database-and-encryption.md) — needs schema and encryption utilities

## Open Questions

- Should deleting an account cascade-delete all its transactions, or soft-delete/archive?
- Should balance history be tracked automatically (snapshot on each update) or only when imported via CSV?
