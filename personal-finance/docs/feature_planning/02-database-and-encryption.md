# 02 — Database & Encryption

**Status:** Not Started
**Phase:** 1 — Foundation
**Priority:** High

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

## Open Questions

- Which fields exactly need encryption vs. which can remain plaintext?
- Should transaction amounts be encrypted (prevents sum queries) or left plaintext?
- Backup strategy for the database — Railway automatic backups sufficient?
- Key rotation strategy — how to re-encrypt data if the master key is compromised?
