# 33 — Onboarding Flow & Note Templates

**Status:** Planned
**Phase:** Phase 1 — Launch Readiness
**Priority:** High

## Summary

New users currently see an empty dashboard with no guidance. The first 5 minutes determine retention. Add an onboarding experience and note templates to reduce friction and showcase features.

## Onboarding Flow

### First Login Experience

1. **Welcome modal** — brief intro (3 slides max):
   - "Welcome to [Product Name]" with logo
   - "Your notes sync everywhere" — show web/desktop/mobile icons
   - "AI built in" — mention completions, transcription, Q&A
   - "Get started" button → creates first note or opens template picker

2. **Sample notes** (created on first login):
   - "Getting Started" — overview of features, keyboard shortcuts, wiki-link demo
   - "Markdown Cheat Sheet" — all supported syntax with examples
   - Both in a "Welcome" folder

3. **Feature hints** — subtle tooltips on first use:
   - First time opening command palette → "Tip: Use Cmd+P anytime to find commands"
   - First time in editor → "Tip: Try Cmd+Shift+Space for AI completions"
   - Dismiss permanently after shown once (localStorage flag)

### Returning User

- No onboarding on subsequent logins
- Dashboard shows recent notes, favorites, quick actions (already exists)

## Note Templates

### Built-in Templates

| Template | Content |
|---|---|
| **Blank Note** | Empty (default) |
| **Meeting Notes** | Date, attendees, agenda, action items, notes sections |
| **Daily Journal** | Date heading, gratitude, tasks, reflection sections |
| **Project Plan** | Overview, goals, milestones, tasks, notes |
| **Reading Notes** | Title, author, key takeaways, quotes, thoughts |
| **Weekly Review** | Accomplishments, challenges, next week goals |
| **Bug Report** | Steps to reproduce, expected, actual, environment |
| **Decision Log** | Context, options, decision, rationale |

### Implementation

- Templates stored as markdown strings in `src/lib/templates.ts`
- "New from template" option in:
  - Command Palette (`Cmd+P` → "New from Template")
  - New note "+" button (long-press or dropdown)
  - Dashboard quick actions
- Template picker: modal with template list, preview pane showing rendered markdown
- Selecting a template creates a new note with the template content pre-filled
- Templates use `{{date}}`, `{{time}}` placeholders that get replaced on creation

### Daily Notes

- Automatic daily note creation (opt-in via settings)
- When enabled, opening the app creates today's note if it doesn't exist
- Uses the "Daily Journal" template (or user-chosen default)
- Daily notes go in a configurable folder (default: "Daily Notes")
- Title format: `YYYY-MM-DD` (e.g., "2026-04-07")
- Calendar view in sidebar to navigate past daily notes (future enhancement)

## Files

### New
- `src/lib/templates.ts` — template definitions
- `src/components/TemplatePicker.tsx` — modal for choosing template
- `src/components/OnboardingModal.tsx` — first-login welcome flow

### Modified
- `src/pages/NotesPage.tsx` — onboarding trigger, template creation
- `src/components/Dashboard.tsx` — "New from template" quick action
- `src/commands/registry.ts` — "New from Template" command

## Verification

- First login shows onboarding modal with sample notes created
- Subsequent logins skip onboarding
- Template picker shows all templates with preview
- Creating from template fills note with correct content
- Date/time placeholders are replaced
- Daily notes auto-create on app open (when enabled)
- Onboarding and templates work on web, desktop, and mobile
