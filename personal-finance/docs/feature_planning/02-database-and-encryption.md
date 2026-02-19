# 02 — Database & Encryption

**Status:** Complete
**Phase:** 1 — Foundation
**Priority:** High
**Completed:** v1.3.0

> **Implementation details:** [features/02-database-and-encryption.md](../features/02-database-and-encryption.md)

## Summary

Set up PostgreSQL with Prisma ORM and implement application-level field encryption using AES-256-GCM for sensitive financial data.

## Requirements

- PostgreSQL database provisioned via Railway's native Postgres plugin
- Prisma ORM for schema definition, migrations, and type-safe queries
- Application-level encryption for sensitive fields before storing in Postgres:
  - Account numbers
  - Account balances
  - Transaction amounts (if needed)
- AES-256-GCM encryption with:
  - Unique IV (initialization vector) per encrypted field
  - Auth tag stored alongside ciphertext for integrity verification
- Master encryption key stored as a Railway environment variable, never in code
- Database schema covering core entities:
  - `User` (single user, but schema supports it)
  - `Account` (checking, savings, HYS, credit card, loan)
  - `Transaction` (date, description, amount, category, account reference)
  - `Balance` (historical balance snapshots per account)
- Prisma middleware or utility functions for transparent encrypt/decrypt on read/write
- Seed script for initial setup (create the single user, seed account types)

## Technical Considerations

- Prisma generates TypeScript types from the schema — these feed into `packages/shared/`
- Encrypted fields are stored as strings (base64-encoded ciphertext + IV + auth tag)
- Querying/sorting on encrypted fields is not possible — only encrypt fields that don't need to be queried
- Consider a `crypto.ts` utility in `packages/shared/` with `encrypt(plaintext, key)` and `decrypt(ciphertext, key)` functions
- Railway Postgres connection string provided via `DATABASE_URL` env var
- Run `prisma migrate deploy` on Railway deploy, `prisma migrate dev` locally

## Dependencies

- [00 — Project Scaffolding](00-project-scaffolding.md) — needs monorepo and API package

## Resolved Open Questions

- **Which fields need encryption**: Account name, institution, accountNumber, currentBalance, interestRate, transaction description, amount, notes, and balance amount
- **Transaction amounts**: Encrypted (security prioritized over SQL query convenience; aggregation done in application layer)
- **Backup strategy**: Railway automatic daily backups
- **Key rotation**: Not yet implemented; would require a data migration script to re-encrypt all fields
