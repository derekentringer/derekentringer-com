# 05 — Category Rule Engine

**Status:** Not Started
**Phase:** 2 — Data Import
**Priority:** High

## Summary

Auto-categorize transactions using rules that match merchant descriptions to categories. Chase credit card CSVs include a Category field; checking/savings CSVs do not. The rule engine fills the gap and learns from user corrections over time.

## Requirements

- Default categories:
  - Housing, Utilities, Groceries, Dining, Transportation, Entertainment, Shopping, Health, Insurance, Subscriptions, Income, Transfer, Other
- Rule types:
  - **Bank-provided** — Chase credit card CSVs include a `Category` column; import as-is
  - **Keyword match** — if description contains "SPOTIFY" → Entertainment
  - **User-defined** — manually assign a category to a transaction, optionally create a rule from it
- Rule application priority:
  1. Exact user-defined rule (highest)
  2. Keyword match rule
  3. Bank-provided category
  4. Uncategorized (prompt user)
- When a user categorizes a transaction, offer to create a rule: "Always categorize transactions from SPOTIFY as Entertainment?"
- Rules persist in the database and apply to future imports automatically
- Bulk categorization: select multiple uncategorized transactions, assign a category, optionally create rules
- API endpoints:
  - `GET /categories` — list all categories
  - `POST /categories` — create custom category
  - `GET /rules` — list categorization rules
  - `POST /rules` — create a rule
  - `PUT /rules/:id` — update a rule
  - `DELETE /rules/:id` — delete a rule
- Web UI: categorization view during import review + standalone rule management page

## Technical Considerations

- Rules stored as database records: `{ pattern: string, matchType: 'contains' | 'exact' | 'regex', category: string }`
- Apply rules in bulk after CSV parsing, before showing the review screen
- Chase credit card categories can seed the rule engine (map Chase category names to internal categories)
- Consider case-insensitive matching for description patterns
- Rule conflicts: if multiple rules match, use the most specific (exact > contains > regex)

## Dependencies

- [02 — Database & Encryption](02-database-and-encryption.md) — needs schema for rules and categories
- [04 — CSV Import System](04-csv-import-system.md) — rules apply during import flow

## Open Questions

- Should categories be a fixed enum or fully user-customizable?
- How to handle Chase's category names vs. internal category names (mapping table)?
- Should rules support regex, or keep it simple with contains/exact match only?
- ML-based categorization in the future, or keep it rule-based?
