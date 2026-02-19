# 03 — Account Management

**Status:** Complete
**Phase:** 1 — Foundation
**Priority:** High
**Completed:** v1.4.0

## Summary

Full CRUD for financial accounts with encrypted storage, PIN-gated write operations, and a responsive web UI built with Tailwind CSS v4 and shadcn/ui. Includes a responsive drawer navigation system with collapsible sidebar and mobile sheet overlay.

## What Was Implemented

### Shared Package (`packages/shared/`)

- Account types enum: `AccountType` (checking, savings, hys, credit_card, loan, investment)
- API types: `Account`, `CreateAccountRequest`, `UpdateAccountRequest`, `AccountListResponse`, `AccountResponse`
- Shared Fastify schema validation types

### Finance API (`packages/finance-api/`)

#### Store Layer (`src/store/accountStore.ts`)
- `createAccount(data)` — encrypts fields via mapper, stores in Postgres
- `getAccount(id)` — fetch by ID, decrypt and return
- `listAccounts(filter?)` — list all (optionally filter by isActive), decrypt, sort alphabetically
- `updateAccount(id, data)` — partial update with encryption; auto-creates balance snapshot when currentBalance changes (within a Prisma transaction)
- `deleteAccount(id)` — cascade deletes associated transactions and balances (via Prisma schema)

#### API Routes (`src/routes/accounts.ts`)
All routes require JWT authentication via `fastify.authenticate` hook.

| Method | Path | Description | Validation |
|--------|------|-------------|------------|
| GET | `/accounts` | List all accounts | Optional `?active=true\|false` filter |
| GET | `/accounts/:id` | Get single account | CUID format validation |
| POST | `/accounts` | Create account | Fastify JSON schema + type enum + number validation + string length limits |
| PATCH | `/accounts/:id` | Partial update | Same validations, at least one field required |
| DELETE | `/accounts/:id` | Delete account | CUID format validation |

Validation includes:
- Account type must be a valid `AccountType` enum value
- `currentBalance` and `interestRate` must be finite numbers
- String fields capped at 255 characters
- Account ID must match CUID pattern

#### Test Coverage
- `src/__tests__/accountStore.test.ts` — unit tests for all store operations with mock Prisma
- `src/__tests__/accounts.test.ts` — integration tests for all API routes via `app.inject()`

### Finance Web (`packages/finance-web/`)

#### UI Framework Migration
Migrated from CSS Modules to Tailwind CSS v4 + shadcn/ui:

- **Tailwind CSS v4** with `@tailwindcss/vite` plugin (no PostCSS config needed)
- **shadcn/ui** (New York style) — 13 component files in `src/components/ui/`:
  - Button, Input, Label, Dialog, AlertDialog, Table, Sheet, Select, Checkbox, Separator, Tooltip, Badge, Card
- **Radix UI** primitives for accessible components
- **lucide-react** for icons (tree-shakable)
- **clsx + tailwind-merge** via `cn()` helper (`src/lib/utils.ts`)
- Custom dark theme tokens in `src/styles/global.css` via `@theme` block
- Path alias `@/` → `./src` in Vite and TypeScript configs
- All 7 `.module.css` files deleted

#### Responsive Drawer Navigation
- **Sidebar** (`src/components/Sidebar.tsx`):
  - Desktop (>=768px): fixed left sidebar, 240px wide, collapsible to 64px icons-only mode
  - Mobile (<768px): shadcn Sheet slides in from left, closes on route change
  - Nav items: Dashboard, Accounts, Transactions, Reports, Settings
  - Active route highlighted with `bg-primary/10 text-primary`
  - Collapsed mode shows Tooltip labels on hover
  - Collapse state persisted to localStorage
- **Header** (`src/components/Header.tsx`):
  - 56px sticky top bar
  - Hamburger button (mobile only) toggles drawer
  - "fin" title (mobile only, shown in sidebar on desktop)
  - Username + logout button (always visible)
- **AppLayout** (`src/components/AppLayout.tsx`):
  - Composes Sidebar + Header + `<Outlet />`
  - Wraps with TooltipProvider for sidebar tooltips
- **useSidebar hook** (`src/hooks/useSidebar.ts`):
  - `isCollapsed` — persisted to localStorage
  - `isMobileOpen` — resets on resize to desktop
  - `toggleCollapsed`, `toggleMobile`, `closeMobile`

#### Route Structure
```
/login          → LoginPage (no layout)
/*              → NotFoundPage (no layout)
<ProtectedRoute>
  <AppLayout>
    /             → DashboardPage
    /accounts     → AccountsPage
    /transactions → TransactionsPage (placeholder)
    /reports      → ReportsPage (placeholder)
    /settings     → SettingsPage (placeholder)
```

Single `ProtectedRoute` wrapping the layout route via `<Outlet />` pattern.

#### Account Management UI

- **AccountsPage** (`src/pages/AccountsPage.tsx`):
  - shadcn Table with responsive column hiding (Type hidden <640px, Institution hidden <768px)
  - Badge for Active/Inactive status
  - Add Account and Edit/Delete buttons
  - Wrapped in shadcn Card with CardHeader/CardContent
  - PIN-gated via PinGate component

- **AccountForm** (`src/components/AccountForm.tsx`):
  - shadcn Dialog modal for create and edit modes
  - Form fields: name, type (Radix Select), institution, currentBalance, accountNumber, interestRate, csvParserId, isActive (Checkbox)
  - Validates required fields before submission

- **ConfirmDialog** (`src/components/ConfirmDialog.tsx`):
  - shadcn AlertDialog for delete confirmation
  - Accessible focus trap, ARIA labels, escape key handling

- **PinGate** (`src/components/PinGate.tsx`):
  - Full-screen overlay prompting for PIN
  - shadcn Card, Input, Button
  - Auto-clears on PIN token expiry

#### API Client
- `src/api/accounts.ts` — `fetchAccounts()`, `createAccount()`, `updateAccount()`, `deleteAccount()`
- Authenticated requests via the shared API client with auto-refresh interceptor

#### Placeholder Pages
- `TransactionsPage`, `ReportsPage`, `SettingsPage` — centered lucide icon + title + "Coming soon"

## Resolved Open Questions

- **Delete behavior**: Cascade delete — deleting an account removes all its transactions and balances (via Prisma `onDelete: Cascade`)
- **Balance history**: Automatically tracked — a balance snapshot is created whenever `currentBalance` is updated (via Prisma transaction in `updateAccount`)
