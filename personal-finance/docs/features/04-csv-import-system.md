# 04 — CSV Import System

**Status:** Complete
**Phase:** 2 — Data Import
**Priority:** High

## Summary

Pluggable CSV parser architecture for importing transactions from bank exports. Supports Chase Checking, Chase Credit Card, and Amex HYS formats with SHA-256 deduplication, auto-categorization via the category rule engine, and a two-phase review-before-commit workflow. Includes transaction listing, editing, filtering, pagination, and sortable table headers.

## What Was Implemented

### Shared Package (`packages/shared/`)

- CSV parser types: `CsvParserId` union, `CSV_PARSER_IDS` array, `CSV_PARSER_LABELS` record
- Import types: `ParsedTransaction`, `CsvImportPreviewResponse`, `CsvImportConfirmRequest`, `CsvImportConfirmResponse`
- Transaction types: `UpdateTransactionRequest`, `TransactionListResponse`, `TransactionResponse`

### Finance API (`packages/finance-api/`)

#### CSV Parsers (`src/csv-parsers/`)

- **`types.ts`** — `RawParsedRow` and `CsvParser` interfaces
- **`csvUtils.ts`** — Lightweight CSV line parser handling quoted fields and BOM stripping; `parseMMDDYYYY` date parser
- **`chaseChecking.ts`** — Chase Checking parser (headers: `Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #`)
- **`chaseCredit.ts`** — Chase Credit Card parser (headers: `Transaction Date,Post Date,Description,Category,Type,Amount,Memo`); extracts `bankCategory` from Category column
- **`amexHys.ts`** — Amex HYS placeholder parser (headers: `Date,Description,Amount,Balance`)
- **`index.ts`** — Parser registry with `getParser(id)` and `getParserIds()`

No external CSV parsing dependency — custom parser handles Chase/Amex simple formats.

#### Deduplication (`src/lib/dedupeHash.ts`)

- `generateDedupeHash(accountId, date, description, amount)` — SHA-256 hex string
- Normalizes input: date-only (YYYY-MM-DD), lowercased/trimmed description, 2-decimal amount
- Hash stored as `dedupeHash` on Transaction model with `@@unique([accountId, dedupeHash])` constraint

#### Transaction Store (`src/store/transactionStore.ts`)

- `listTransactions(filter?)` — accountId, date range, category, limit/offset; returns `{ transactions, total }`
- `getTransaction(id)` — single transaction, decrypted
- `findExistingHashes(accountId, hashes)` — returns `Set<string>` of existing dedupe hashes
- `bulkCreateTransactions(transactions)` — encrypts via mapper, `createMany` with `skipDuplicates`
- `updateTransaction(id, data)` — update category and/or notes with encryption
- `deleteTransaction(id)` — single delete
- `applyRuleToTransactions(rule)` — retroactive rule application (loads all transactions, decrypts descriptions, matches against rule pattern, bulk updates categories)

#### Encryption Mappers (`src/lib/mappers.ts`)

- `encryptTransactionForCreate` — encrypts description, amount, notes; passes through dedupeHash and category as plaintext
- `encryptTransactionForUpdate` — encrypts notes; category stored as plaintext

#### API Routes (`src/routes/transactions.ts`)

All routes require JWT authentication.

| Method | Path | PIN | Description |
|--------|------|-----|-------------|
| GET | `/transactions` | No | List with filters (accountId, startDate, endDate, category, limit, offset) |
| GET | `/transactions/:id` | No | Get single transaction |
| PATCH | `/transactions/:id` | No | Update category and/or notes |
| DELETE | `/transactions/:id` | Yes | Delete transaction |
| POST | `/transactions/import/preview` | Yes | Upload CSV, parse, deduplicate, auto-categorize |
| POST | `/transactions/import/confirm` | Yes | Save confirmed transactions |

**Preview flow:**
1. Read `accountId` + optional `csvParserId` from query params
2. Read file via `@fastify/multipart`
3. Resolve parser from account's `csvParserId` or query override
4. Parse CSV, generate dedupe hashes, check for existing hashes
5. Auto-categorize via `categorizeTransaction()` with loaded rules
6. Return `ParsedTransaction[]` with duplicate flags and category assignments

**Confirm flow:**
1. Validate accountId and transactions array (JSON body with schema validation)
2. Encrypt and bulk-insert via `bulkCreateTransactions`
3. Return imported/skipped counts

#### App Registration (`src/app.ts`)

- Registered `@fastify/multipart` (5MB limit, 1 file max)
- Registered transaction routes at `/transactions`
- CORS methods expanded to include `PUT`, `PATCH`, `DELETE`, `OPTIONS`

#### Dependencies

- Added `@fastify/multipart` to `packages/finance-api/package.json`

### Prisma Schema Changes

- Added `dedupeHash String?` to Transaction model
- Added `@@unique([accountId, dedupeHash])` constraint for per-account deduplication

### Finance Web (`packages/finance-web/`)

#### API Client (`src/api/transactions.ts`)

- `fetchTransactions(params?)` — GET with query params
- `fetchTransaction(id)` — GET single
- `updateTransaction(id, data)` — PATCH category/notes
- `uploadCsvPreview(accountId, file, pinToken, csvParserId?)` — POST multipart with `x-pin-token` header
- `confirmImport(data, pinToken)` — POST JSON with `x-pin-token` header
- `deleteTransaction(id, pinToken)` — DELETE with `x-pin-token` header

#### API Client Fix (`src/api/client.ts`)

- Fixed `Content-Type: application/json` only set when `options.body` is present (was causing DELETE requests to fail with empty JSON body error)

#### CSV Import Dialog (`src/components/CsvImportDialog.tsx`)

Multi-step dialog:

1. **Upload** — Account select (active accounts), optional parser override select, file input, PinGate overlay for PIN verification
2. **Preview** — Table with checkboxes (include/exclude), date, description, amount, inline category select, duplicate badge; duplicates highlighted and excluded by default; summary stats
3. **Result** — Success message with imported/skipped counts; "Done" closes dialog and refreshes transaction list

#### Transactions Page (`src/pages/TransactionsPage.tsx`)

- Filter bar: Account select, Category select, date range inputs
- Sortable table headers (Date, Description, Amount, Category, Account) with arrow icons
  - Click once: sort ascending; click again: sort descending; third click: reset to server order
  - Client-side sorting on current page (encrypted fields prevent server-side sorting)
- Pagination with page size of 50
- "Import CSV" button in header
- Edit button per row opens `TransactionEditDialog`

#### Transaction Edit Dialog

- Inline in `TransactionsPage.tsx` as `TransactionEditDialog` component
- Shows transaction date, amount, and description as read-only context
- Editable fields: Category (select from categories list), Notes (text input)
- Only sends changed fields to API

#### Account Form (`src/components/AccountForm.tsx`)

- Changed `csvParserId` from free-text Input to Select dropdown populated from `CSV_PARSER_IDS` / `CSV_PARSER_LABELS`
- Balance field no longer required; defaults to 0 when empty

#### Confirm Dialog (`src/components/ConfirmDialog.tsx`)

- Replaced `AlertDialog` with regular `Dialog` + `Button` to fix async delete operations (AlertDialogAction auto-close was preventing async handlers from completing)

## Resolved Open Questions

- **Amex HYS format**: Placeholder parser assuming `Date,Description,Amount,Balance` columns
- **Parser selection**: Account's `csvParserId` used by default; query parameter override available
- **CSV encoding**: BOM stripping handled in `csvUtils.ts`
- **Raw CSV storage**: Not stored — only parsed transactions are persisted
- **Sorting**: Client-side on current page due to encrypted description/amount fields
