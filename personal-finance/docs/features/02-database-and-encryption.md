# 02 — Database & Encryption

**Status:** Complete
**Phase:** 1 — Foundation
**Priority:** High
**Completed:** v1.3.0

## Summary

PostgreSQL database via Prisma ORM with application-level AES-256-GCM field encryption for sensitive financial data. All sensitive fields (account names, balances, account numbers, transaction descriptions, transaction amounts) are encrypted before storage and decrypted on read.

## What Was Implemented

### Database Setup

- **PostgreSQL** provisioned via Railway's native Postgres plugin
- **Prisma ORM v7** with `@prisma/adapter-pg` for type-safe queries and migrations
- `prisma/schema.prisma` — schema definition with four models:
  - `RefreshToken` — JWT refresh token storage (hashed tokens, expiry, user binding)
  - `Account` — financial accounts (name, type, institution, balance, etc.)
  - `Transaction` — individual transactions (date, description, amount, category)
  - `Balance` — historical balance snapshots per account
- `prisma.config.ts` — Prisma CLI configuration (datasource URL, migrations path)
- `src/generated/prisma/` — auto-generated Prisma client (gitignored)
- `src/lib/prisma.ts` — PrismaClient singleton with `setPrisma()` for test injection

### Schema Design

| Model | Key Fields | Encrypted Fields |
|-------|-----------|-----------------|
| RefreshToken | token (SHA-256 hash), userId, expiresAt | None (token is hashed, not encrypted) |
| Account | name, type, institution, accountNumber, currentBalance, interestRate, csvParserId, isActive | name, institution, accountNumber, currentBalance, interestRate |
| Transaction | accountId, date, description, amount, category, notes | description, amount, notes |
| Balance | accountId, balance, date | balance |

Relationships:
- Account → Transaction (one-to-many, cascade delete)
- Account → Balance (one-to-many, cascade delete)

Indexes:
- `RefreshToken.expiresAt` — efficient cleanup of expired tokens
- `Account.isActive` — filter active/inactive accounts
- `Transaction.accountId`, `Transaction.date` — query by account and date range
- `Balance.accountId`, `Balance.date` — query by account and date range

### Encryption Layer

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key management**: 64-character hex string (32 bytes) stored as `ENCRYPTION_KEY` env var
- **Shared crypto** (`packages/shared/`) — `encrypt(plaintext, key)` and `decrypt(ciphertext, key)` with unique IV per encryption
- **Finance API encryption** (`src/lib/encryption.ts`):
  - `initEncryptionKey(keyHex)` — validates and stores the key buffer
  - `encryptField(value)` / `decryptField(ciphertext)` — string encryption
  - `encryptNumber(value)` / `decryptNumber(ciphertext)` — number → encrypted string
  - `encryptOptionalField` / `decryptOptionalField` — null-safe string helpers
  - `encryptOptionalNumber` / `decryptOptionalNumber` — null-safe number helpers

### Mapper Layer

`src/lib/mappers.ts` — Prisma row ↔ API type mappers with transparent encrypt/decrypt:

- **Account mappers**:
  - `decryptAccount(row)` — Prisma row → API `Account` type (decrypts name, institution, accountNumber, currentBalance, interestRate)
  - `encryptAccountForCreate(input)` — API create request → encrypted Prisma data
  - `encryptAccountForUpdate(input)` — partial update → encrypted Prisma data (only encrypts provided fields)
- **Transaction mappers**:
  - `decryptTransaction(row)` — decrypts description, amount, notes
  - `encryptTransactionForCreate(input)` — encrypts description, amount, notes
- **Balance mappers**:
  - `decryptBalance(row)` — decrypts balance
  - `encryptBalanceForCreate(input)` — encrypts balance

### Refresh Token Store

`src/store/refreshTokenStore.ts` — database-backed refresh token management (migrated from in-memory):
- Tokens stored as SHA-256 hashes (not raw values)
- `storeRefreshToken(token, userId)` — hash and store with 7-day expiry
- `lookupRefreshToken(token)` — hash, lookup, validate expiry
- `revokeRefreshToken(token)` — delete by hash
- `revokeAllRefreshTokens(userId)` — delete all tokens for a user
- `cleanupExpiredTokens()` — batch delete expired tokens

### Migrations

Three migrations applied:
1. `20260218210452_init` — initial schema (RefreshToken, Account, Transaction, Balance)
2. `20260219000000_add_account_fields` — added interestRate, csvParserId, isActive to Account
3. `20260219010000_add_account_index_balance_audit` — added indexes and balance audit support

### Data Migration Script

`prisma/data-migrations/encrypt-plaintext-fields.ts` — one-time script to encrypt any existing plaintext data after adding encryption

### Test Infrastructure

- `src/__tests__/helpers/mockPrisma.ts` — typed `MockPrisma` interface with `createMockPrisma()` factory for unit testing
- `src/__tests__/mappers.test.ts` — round-trip encrypt/decrypt tests for all mapper functions
- `src/__tests__/refreshTokenStore.test.ts` — full coverage of token store operations using mock Prisma

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ENCRYPTION_KEY` | Yes | 64-character hex string (32 bytes for AES-256-GCM) |

## Resolved Open Questions

- **Which fields need encryption**: Account name, institution, accountNumber, currentBalance, interestRate, transaction description, amount, notes, and balance amount
- **Transaction amounts**: Encrypted (prevents SQL sum queries, but security prioritized; aggregation done in application layer)
- **Backup strategy**: Railway automatic daily backups
- **Key rotation**: Not yet implemented; would require a data migration script to re-encrypt all fields
