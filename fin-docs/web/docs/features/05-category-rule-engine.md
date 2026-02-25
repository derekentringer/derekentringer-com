# 05 — Category Rule Engine

**Status:** Complete
**Phase:** 2 — Data Import
**Priority:** High

## Summary

Auto-categorize transactions using user-defined rules that match descriptions to categories. Supports exact and contains match types with priority-based ordering. Rules can be retroactively applied to existing transactions when created or edited. Includes full category CRUD with 13 seeded defaults and a Settings page for management.

## What Was Implemented

### Shared Package (`packages/shared/`)

- Category types: `Category`, `CreateCategoryRequest`, `UpdateCategoryRequest`, `CategoryListResponse`, `CategoryResponse`
- Rule types: `RuleMatchType`, `CategoryRule`, `CreateCategoryRuleRequest`, `UpdateCategoryRuleRequest`, `CategoryRuleListResponse`, `CategoryRuleResponse` (with optional `appliedCount`)

### Finance API (`packages/finance-api/`)

#### Category Store (`src/store/categoryStore.ts`)

- `listCategories()` — sorted by `sortOrder` ascending
- `createCategory(data)` — auto-increments `sortOrder` based on current max
- `updateCategory(id, data)` — update name and/or sortOrder
- `deleteCategory(id)` — prevents deleting default categories (returns `"Cannot delete a default category"`)
- `seedDefaultCategories()` — upserts 13 defaults on app startup: Housing, Utilities, Groceries, Dining, Transportation, Entertainment, Shopping, Health, Insurance, Subscriptions, Income, Transfer, Other

Category names are stored as plaintext (not encrypted) — they are functional labels, not PII.

#### Category Rule Store (`src/store/categoryRuleStore.ts`)

- `listCategoryRules()` — sorted by `priority` ascending (lower = higher priority)
- `createCategoryRule(data)` — default priority: 0 for exact match, 100 for contains match
- `updateCategoryRule(id, data)` — partial update
- `deleteCategoryRule(id)` — delete by ID

#### Category Engine (`src/lib/categoryEngine.ts`)

- `categorizeTransaction({ description, bankCategory }, rules)` — returns category name or null
- Iterates rules by priority ASC; first match wins
- Match types: `exact` (full description match) and `contains` (substring match)
- Case-insensitive matching on both description and pattern
- Falls back to `bankCategory` if no rule matches (e.g., Chase Credit Card's Category column)
- Returns null if nothing matches

#### Retroactive Rule Application (`src/store/transactionStore.ts`)

- `applyRuleToTransactions(rule)` — applies a single rule to all existing transactions
- Loads all transactions with null category OR category different from the rule's target
- Decrypts each description and matches against the rule's pattern/matchType
- Bulk updates matching transactions' categories via `updateMany`
- Returns count of updated transactions

#### API Routes

**Categories (`src/routes/categories.ts`):**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/categories` | List all categories |
| POST | `/categories` | Create category |
| PATCH | `/categories/:id` | Update category |
| DELETE | `/categories/:id` | Delete category (400 if default) |

**Category Rules (`src/routes/categoryRules.ts`):**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/category-rules` | List all rules |
| POST | `/category-rules` | Create rule (optional `?apply=true` to apply retroactively) |
| PATCH | `/category-rules/:id` | Update rule (optional `?apply=true` to apply retroactively) |
| DELETE | `/category-rules/:id` | Delete rule |

All routes require JWT authentication. When `?apply=true` is passed on POST/PATCH, the rule is applied to all matching existing transactions after creation/update, and `appliedCount` is included in the response.

#### App Registration (`src/app.ts`)

- Registered category routes at `/categories`
- Registered category rule routes at `/category-rules`
- `seedDefaultCategories()` called in `onReady` hook

### Prisma Schema Changes

```prisma
model Category {
  id        String   @id @default(cuid())
  name      String   @unique
  isDefault Boolean  @default(false)
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([sortOrder])
  @@map("categories")
}

model CategoryRule {
  id        String   @id @default(cuid())
  pattern   String
  matchType String
  category  String
  priority  Int      @default(100)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([priority])
  @@map("category_rules")
}
```

Category and rule data are stored as plaintext (not encrypted) — they are configuration, not PII.

### Finance Web (`packages/finance-web/`)

#### API Clients

- `src/api/categories.ts` — `fetchCategories()`, `createCategory()`, `updateCategory()`, `deleteCategory()`
- `src/api/categoryRules.ts` — `fetchCategoryRules()`, `createCategoryRule(data, options?)`, `updateCategoryRule(id, data, options?)`, `deleteCategoryRule()`
  - `options.apply` flag appends `?apply=true` query parameter

#### Settings Page (`src/pages/SettingsPage.tsx`)

Two-tab layout:

**Categories tab:**
- Table: Name, Type (Default badge), Actions (Edit/Delete)
- "Add Category" button opens `CategoryNameDialog`
- Default categories cannot be deleted (button disabled)
- Edit opens `CategoryNameDialog` with pre-filled name

**Category Rules tab:**
- Table: Pattern (monospace), Match Type (badge), Category, Priority, Actions (Edit/Delete)
- "Add Rule" button opens `CategoryRuleForm`
- Edit opens `CategoryRuleForm` with pre-filled values

#### Category Rule Form (`src/components/CategoryRuleForm.tsx`)

Dialog form with fields:
- Pattern (text input)
- Match Type (Select: Contains / Exact)
- Category (Select populated from categories list)
- Priority (number input; 0 = highest priority)
- "Apply to existing transactions" checkbox
- After save with apply enabled, shows "Updated N transactions" confirmation with "Done" button

## Resolved Open Questions

- **Categories**: Fully user-customizable; 13 defaults seeded on startup via upsert; defaults cannot be deleted
- **Match types**: Contains and exact only (no regex)
- **Rule conflicts**: Priority-based ordering — iterate rules by priority ASC, first match wins
- **Chase categories**: Passed through as `bankCategory` field; used as fallback when no rule matches
- **Category storage on transactions**: Stored as category name string (not a FK); deleting/renaming a category does not retroactively update historical transactions
- **Retroactive application**: Applied via `?apply=true` query parameter; decrypts all transaction descriptions in memory for matching (acceptable for personal finance scale)
