# 05 — Category Rule Engine

**Status:** Complete
**Phase:** 2 — Data Import
**Priority:** High

> **Implementation details:** [features/05-category-rule-engine.md](../features/05-category-rule-engine.md)

## Summary

Auto-categorize transactions using user-defined rules that match descriptions to categories. Supports exact and contains match types with priority-based ordering. Rules can be retroactively applied to existing transactions. Includes full category CRUD with 13 seeded defaults.

## Requirements

- 13 default categories seeded on startup (Housing, Utilities, Groceries, Dining, Transportation, Entertainment, Shopping, Health, Insurance, Subscriptions, Income, Transfer, Other)
- User-customizable categories (create, edit, delete; defaults cannot be deleted)
- Category rules with pattern, matchType (exact/contains), category, and priority
- Case-insensitive matching; priority ASC ordering (lower = higher priority)
- Auto-categorization during CSV import preview
- Retroactive rule application to existing transactions on rule create/edit
- Bank-provided category fallback (Chase Credit Card `Category` column)
- Settings page with categories and rules management tabs

## Dependencies

- [02 — Database & Encryption](02-database-and-encryption.md) — needs schema for rules and categories
- [04 — CSV Import System](04-csv-import-system.md) — rules apply during import flow

## Resolved Open Questions

- **Categories**: Fully user-customizable with seeded defaults; stored as `name` string on transactions (not FK)
- **Match types**: Contains and exact only (no regex); keeps it simple and predictable
- **Rule conflicts**: Priority-based — iterate rules by priority ASC, first match wins
- **Chase categories**: Passed through as `bankCategory`; used as fallback when no rule matches
- **Retroactive application**: Optional via "Apply to existing transactions" checkbox on rule create/edit
