# PDF Statement Import & Account Profiles

**Status:** Complete
**Phase:** 3 — Statement Import & Profiles
**Priority:** High

## Summary

AI-powered PDF statement import with account-type-specific profile extraction. Uses the Claude API to parse financial statements and extract structured data including balances, dates, and type-specific details (loan terms, investment returns, savings APY). Includes a Fidelity 401(k) CSV parser and schema extensions for account-type profiles. Two-phase review-before-commit workflow with duplicate detection and atomic balance+profile saves.

## What Was Implemented

### Shared Package (`packages/shared/`)

- Account type enum expanded: `AccountType` now includes `Other`
- New loan type: `LoanType` union — `"fixed" | "variable" | "fixed-mortgage" | "variable-mortgage"`
- New account fields: `originalBalance`, `originationDate`, `maturityDate`, `loanType`, `employerName`
- Profile data types:
  - `LoanProfileData` — periodStart, periodEnd, interestRate, monthlyPayment, principalPaid, interestPaid, escrowAmount, nextPaymentDate, remainingTermMonths
  - `LoanStaticData` — originalBalance, originationDate, maturityDate, loanType
  - `InvestmentProfileData` — periodStart, periodEnd, rateOfReturn, ytdReturn, totalGainLoss, contributions, employerMatch, vestingPct, fees, expenseRatio, dividends, capitalGains, numHoldings
  - `SavingsProfileData` — periodStart, periodEnd, apy, interestEarned, interestEarnedYtd
- Balance type updated with optional profile attachments: `loanProfile`, `investmentProfile`, `savingsProfile`
- PDF import types: `PdfImportPreviewResponse`, `PdfImportConfirmRequest`, `PdfImportConfirmResponse`
- New CSV parser: `CsvParserId` extended with `"fidelity-401k"`; `CSV_PARSER_IDS` and `CSV_PARSER_LABELS` updated

### Finance API (`packages/finance-api/`)

#### PDF Extraction Engine (`src/lib/pdfExtract.ts`)

- **PDF parsing**: `pdf-parse` library with PDF magic byte validation (`%PDF-` header check)
- **AI extraction**: Anthropic Claude API (`claude-sonnet-4-20250514`) with structured tool use
- **Account-type-aware extraction**: Dynamic tool schema and system prompt per account type:
  - **Loan**: Extracts interest rate, payment breakdown (principal, interest, escrow), remaining term, origination details, loan type
  - **Investment**: Extracts rate of return, YTD return, gain/loss, contributions, employer match, vesting, fees, expense ratio, dividends, capital gains, holdings count
  - **Savings/HYS**: Extracts APY, interest earned this period, YTD interest
  - **Generic** (checking, credit, other): Extracts balance and date only
- **Head+tail truncation**: 20KB default, 30KB for investment statements (longer due to holdings tables)
- **Graceful parsing**: Each profile field extracted independently; missing/invalid fields silently omitted
- **Raw text preservation**: Captures exact text snippets from the document for user verification
- **Validation**: Date format validation (`YYYY-MM-DD`), finite number checks, loan type enum validation

#### Balance Store (`src/store/balanceStore.ts`)

- `createBalance(input)` — creates Balance + profile records atomically via Prisma transaction
- `createBalanceInTx(tx, input)` — transactional version for use within existing transactions
- `findBalanceByDate(accountId, date)` — checks for duplicate balances on same calendar day (UTC range)
- `listBalances(accountId)` — lists all balances for an account, ordered by date descending, with related profiles decrypted

#### Balance API Routes (`src/routes/balances.ts`)

All routes require JWT authentication.

| Method | Path | PIN | Description |
|--------|------|-----|-------------|
| GET | `/balances` | No | List balances for an account (`?accountId=...`) |
| POST | `/balances/import/preview` | Yes | Upload PDF, extract balance + profile via AI |
| POST | `/balances/import/confirm` | Yes | Save balance record + profile data atomically |

**Preview flow:**
1. Validate `accountId` query parameter (CUID format)
2. Check `ANTHROPIC_API_KEY` is configured (returns 500 if missing)
3. Fetch account (validates existence)
4. Read uploaded file via `@fastify/multipart`, validate MIME type (`application/pdf`)
5. Extract text from PDF (`pdf-parse`), validate magic bytes
6. Send text to Claude API with account-type-specific tool schema
7. Parse structured extraction result into typed profile data
8. Check for existing balance on the same date (deduplication)
9. Return preview response with extraction data, raw text snippets, and existing balance comparison

**Confirm flow:**
1. Validate `accountId` (CUID format) and request body (JSON schema validation)
2. Validate profile type matches account type (loan profile only for loan accounts, etc.)
3. Within a single Prisma transaction:
   - Create encrypted Balance record
   - Create encrypted profile record (if profile data has at least one non-null field)
   - Optionally update `Account.currentBalance`
   - Optionally update `Account.interestRate` from loan/savings profile
   - Update Account static loan fields (originalBalance, originationDate, maturityDate, loanType)
4. Return confirmation with update flags

#### Fidelity 401(k) CSV Parser (`src/csv-parsers/fidelity401k.ts`)

- Parses Fidelity 401(k) CSV export format
- Headers: `Transaction Date, Investment, Contribution, Description, Activity, Price, Units, Amount`
- Date format: `M/D/YYYY HH:MM:SS AM` (only date part used)
- Description built from Investment + Contribution + Activity fields; includes units/price for purchases and sales
- Activity column used as `bankCategory`
- Registered in parser index as `"fidelity-401k"`

#### Encryption Mappers (`src/lib/mappers.ts`)

New mapper functions for profile encryption/decryption:
- `encryptLoanProfileForCreate(balanceId, data)` — encrypts all 9 loan profile fields
- `encryptInvestmentProfileForCreate(balanceId, data)` — encrypts all 13 investment profile fields
- `encryptSavingsProfileForCreate(balanceId, data)` — encrypts all 5 savings profile fields
- `encryptLoanStaticForUpdate(data)` — encrypts loan static fields for Account update
- `decryptBalance(row)` — extended to decrypt attached profile data

#### App Registration (`src/app.ts`)

- Registered balance routes at `/balances`

#### Dependencies

- Added `pdf-parse` for PDF text extraction
- Added `@anthropic-ai/sdk` for Claude API integration

### Prisma Schema Changes

New models (1:1 relationship with Balance, cascade delete):

```prisma
model LoanProfile {
  id                  String   @id @default(cuid())
  balanceId           String   @unique
  periodStart         String?
  periodEnd           String?
  interestRate        String?
  monthlyPayment      String?
  principalPaid       String?
  interestPaid        String?
  escrowAmount        String?
  nextPaymentDate     String?
  remainingTermMonths String?
  balance             Balance  @relation(...)
}

model InvestmentProfile {
  id            String   @id @default(cuid())
  balanceId     String   @unique
  periodStart   String?
  periodEnd     String?
  rateOfReturn  String?
  ytdReturn     String?
  totalGainLoss String?
  contributions String?
  employerMatch String?
  vestingPct    String?
  fees          String?
  expenseRatio  String?
  dividends     String?
  capitalGains  String?
  numHoldings   String?
  balance       Balance  @relation(...)
}

model SavingsProfile {
  id                String   @id @default(cuid())
  balanceId         String   @unique
  periodStart       String?
  periodEnd         String?
  apy               String?
  interestEarned    String?
  interestEarnedYtd String?
  balance           Balance  @relation(...)
}
```

Account model extended with:
- `originalBalance String?` — original loan amount (encrypted)
- `originationDate String?` — loan origination date (encrypted)
- `maturityDate String?` — loan maturity date (encrypted)
- `loanType String?` — loan type (encrypted)
- `employerName String?` — employer name for investment accounts (encrypted)

Balance model extended with optional profile relations:
- `loanProfile LoanProfile?`
- `investmentProfile InvestmentProfile?`
- `savingsProfile SavingsProfile?`

All profile fields are stored as encrypted strings (AES-256-GCM).

Migration: `20260219030000_add_statement_profiles`

### Finance Web (`packages/finance-web/`)

#### API Client (`src/api/balances.ts`)

- `uploadPdfPreview(accountId, file, pinToken)` — POST multipart with `x-pin-token` header
- `confirmPdfImport(data, pinToken)` — POST JSON with `x-pin-token` header

#### PDF Import Dialog (`src/components/PdfImportDialog.tsx`)

Multi-step dialog (upload → preview → result):

1. **Upload** — Account selector (active accounts only), file input (PDF, 5MB limit), PinGate overlay for PIN verification
2. **Preview** — Extracted balance and date (editable), existing balance comparison, duplicate balance warning, AI extraction details (raw text snippets), account-type-specific profile preview, "Update account balance" checkbox, "Update interest rate" checkbox (for loan/savings)
3. **Result** — Success confirmation with balance, date, and update flags

#### Profile Preview Components (`src/components/pdf-import/`)

- **`PdfPreviewBase.tsx`** — Common fields: date input, balance input, existing balance comparison, duplicate warning, AI extraction details display, account balance update checkbox
- **`LoanProfilePreview.tsx`** — 9 editable period fields (interest rate, monthly payment, principal/interest paid, escrow, next payment date, remaining term) + 4 editable static fields (original balance, origination/maturity dates, loan type) + interest rate update checkbox
- **`InvestmentProfilePreview.tsx`** — 13 editable fields in 2-column grid (rate of return, YTD return, gain/loss, contributions, employer match, vesting, fees, expense ratio, dividends, capital gains, holdings count)
- **`SavingsProfilePreview.tsx`** — 5 editable fields (APY, interest earned, YTD interest) + interest rate update checkbox

#### Accounts Page Update

- Added "Import PDF Statement" button to `AccountsPage.tsx`
- `PdfImportDialog` integrated into the accounts management workflow

## Security Design

- **PIN verification**: Required for both preview and confirm endpoints
- **Known error messages**: Only safe, pre-approved error messages surfaced to clients; all others replaced with generic error
- **Profile type validation**: Server rejects profile data that doesn't match the account type
- **Atomic transactions**: Balance + profile creation guaranteed to succeed or fail together
- **Field-level encryption**: All profile numeric and string data encrypted at rest with AES-256-GCM
- **API key gating**: PDF import disabled at startup if `ANTHROPIC_API_KEY` is not set (logs warning)
- **File validation**: PDF magic bytes checked regardless of declared MIME type

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | No | Anthropic API key for Claude-powered PDF extraction; PDF import disabled if missing |

## Resolved Open Questions

- **PDF parsing approach**: AI-powered extraction via Claude API tool use — flexible enough to handle any statement format without custom parsers per institution
- **Account-type profiles**: Separate profile models (LoanProfile, InvestmentProfile, SavingsProfile) as 1:1 relations on Balance — extensible without schema bloat
- **Duplicate detection**: Checks for existing balance on the same calendar day per account
- **Profile data storage**: All profile fields encrypted; stored as nullable (only non-null fields saved)
- **Interest rate updates**: Optional — user can choose to update Account.interestRate from extracted loan rate or savings APY
- **Loan static fields**: Stored on Account (not on Balance) since they don't change per statement period
