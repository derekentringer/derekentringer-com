# Phase B — Notebook UX rename + top-level-only managed/unmanaged

## Goal

Rename root-level folders to "Notebooks" across the UI, make managed-vs-unmanaged a choice that's **only available at Notebook creation** (never on a nested folder), and surface the model directly in the navigation so users don't have to reason about where the managed boundary is.

Phase A already guarantees the data model matches this mental model. Phase B makes the UI match too.

## Why this matters

Phase A fixes the data; Phase B fixes the words and affordances. Today users see a single unified "Folders" tree and have to learn that some folders are magically disk-backed and some aren't, with per-folder context-menu options ("Save locally", "Stop managing locally") that can be invoked at any depth. Phase B says:

- Top-level containers are **Notebooks**.
- Nested things inside a Notebook are **Folders**.
- A Notebook is either **Managed Locally** or not, chosen at creation, fixed thereafter (except via an explicit convert action).
- Managed/unmanaged is not a per-folder attribute the UI exposes — it's a per-Notebook one. Sub-folders simply live in whichever Notebook they're in.

This is a vocabulary change, a visual change, and a small set of workflow simplifications. **No backend schema change, no wire protocol change.**

## Items

### B.0 — Terminology mapping

**Location**: new `docs/ns/sync-arch/terminology.md` (or an appendix in `invariants.md`).

Single source of truth for the rename:

| Old | New | Where |
|---|---|---|
| Root folder (`parentId === null`) | Notebook | UI labels, dialogs, context menus |
| Nested folder (`parentId !== null`) | Folder | Unchanged in UI |
| "Save folder locally" (context menu on root) | "Convert to Managed Notebook" | Desktop context menu |
| "Stop managing locally" | "Convert to Unmanaged Notebook" | Desktop context menu |
| "Managed Locally" indicator (current icon) | "Managed" badge | All clients |
| "Folders" sidebar header | "Notebooks" | All clients |
| `folder.isLocalFile` (schema, wire, code) | unchanged | Internal; only the UI words change |
| `FolderInfo` (shared type) | unchanged | Internal |

The backend stays "folder" everywhere. Only user-facing strings change.

### B.1 — Web UI rename + reorganization

**Location**: `packages/ns-web/src/components/FolderTree.tsx`, `FolderDeleteDialog.tsx`, dialogs, toasts.

- "FOLDERS" sidebar section header → "NOTEBOOKS".
- Context menu on a root-level folder: label changes per the terminology table.
- Context menu on a nested folder: unchanged (no "convert to managed" option — managed-ness is determined by the Notebook).
- Delete dialog copy: "Delete Notebook 'X'..." vs "Delete Folder 'X'...".
- Cross-boundary move dialog (from Phase A.3) updated to say "Move 'X' into Notebook 'Y'? ..."

Visual differentiation (lightweight; no major redesign):
- Notebooks render with a slightly-heavier font weight or a subtle outline to signal they're the container tier.
- Managed Notebook badge (small "Managed" pill in the accent color) next to the Notebook name. The per-folder icon we render today is removed — a user doesn't need to see the flag on every nested folder when the whole Notebook is managed.

### B.2 — Desktop UI rename

**Location**: `packages/ns-desktop/src/components/FolderTree.tsx`, `FolderDeleteDialog.tsx`, `NotesPage.tsx`.

Mirrors B.1. Where desktop has extra context-menu actions (Save Folder Locally, Stop Managing Locally), those only appear on root-level folders (Notebooks). They disappear from nested-folder menus entirely.

### B.3 — Mobile UI rename

**Location**: `packages/ns-mobile/src` — all folder-related screens + navigation labels.

Same rename pass. Mobile has no "manage/unmanage" action (no disk access), so Notebooks there just differ in labeling + the Managed badge.

### B.4 — Create Notebook UX (distinct from Create Folder)

**Location**: `NotesPage.tsx` on every client.

Today, clicking "+" in the Folders section creates a folder (which becomes a root if no parent is active). Replace with two distinct affordances:

- **Create Notebook** (at the sidebar top, next to "NOTEBOOKS"): prompts name, plus a toggle **"Manage locally (requires desktop)"** defaulting off. Web + mobile show the toggle but clicking it opens a dialog explaining "You'll need to complete this from the desktop app." Desktop lets you complete it inline (pick a directory on disk).
- **Create Folder** (inside an open Notebook): prompts only name. Managed-ness inherits from the Notebook (enforced by Phase A).

This replaces today's "create folder anywhere" workflow with one that makes the Notebook/Folder distinction explicit.

### B.5 — Sidebar navigation restructure (optional)

**Location**: `NotesPage.tsx` sidebar on each client.

Option 1 — **Minimal**: keep the current tree view; rename headers; add Managed badge on Notebooks. Zero learning curve for existing users.

Option 2 — **Notebook-first**: top-level list shows just Notebooks. Clicking one expands its folder tree in-place (accordion) or in a second panel. More prominent UX, bigger refresh, worth it only if the Notebook concept gets heavy use.

Recommend Option 1 for Phase B. Option 2 is a future polish pass.

### B.6 — Onboarding + help text

**Location**: `packages/ns-web/src/components/AboutDialog.tsx`, any first-run empty states, settings help.

- First-run empty-state copy on the Notebooks list: "Create your first Notebook. Notebooks can be synced to the cloud only, or also managed as a folder of files on your desktop."
- Settings → Help snippet explaining the Managed / Unmanaged distinction and how Convert works.
- Release notes for the rename itself: "Root folders are now called Notebooks. Nothing in your data has changed — just the labels."

### B.7 — Prevent invalid-shape creations in the UI

**Location**: all three clients.

With Phase A's invariant, the backend rejects bad state. Phase B makes the UI never offer the invalid options in the first place:

- Can't right-click a nested folder and "Save locally" — the menu item only appears on Notebooks.
- Can't drag a nested folder to the root level in a way that would make it a Notebook with a different managed status than its old root — the DnD target either disallows it or routes through the cross-boundary dialog (already from Phase A).
- Creating a new folder inside an unmanaged Notebook: no "managed" toggle shown. Creating inside a managed Notebook: no toggle either — it inherits.

This is defense-in-depth: Phase A's 409s catch violations at the API layer; Phase B removes the affordances that would cause them.

### B.8 — Tests

**Location**: `packages/ns-web/src/__tests__/`, `packages/ns-desktop/src/__tests__/`, `packages/ns-mobile/src/__tests__/`.

- Render tests asserting the new terminology is present in critical surfaces (sidebar header, delete dialog, context menus).
- Interaction tests for the new Create-Notebook flow (with + without managed toggle).
- Interaction tests asserting nested-folder context menus don't contain "Save locally" / "Stop managing locally".

## Edge cases covered

| Scenario | Behavior |
|---|---|
| Existing user upgrades to Phase B | Root folders become Notebooks visually; no data migration; managed status preserved via Phase A's invariant. |
| User tries to create a nested folder with different managed status than parent | UI doesn't offer the option; Phase A enforces if they somehow reach the API anyway. |
| User drags a Notebook into another Notebook (making it a nested folder) | Cross-boundary move dialog from Phase A if it crosses managed boundary; otherwise simple reparent. Needs UI confirm either way because it demotes a Notebook to a Folder. |
| User drags a nested folder to the root level | Promotes to Notebook. Show a small confirm ("Promote 'X' to a Notebook?") that's cheaper than the cross-boundary dialog. If it's also cross-boundary (unlikely — root flag is preserved on promote), Phase A's dialog supersedes. |
| User unfamiliar with the terms | Onboarding copy explains. Settings Help has the same. |
| Localization | English-only for now; the rename is an English vocabulary choice. Phase B.n could do i18n. |

## Done criteria

- All three clients show "Notebook" for root-level folders and "Folder" for nested.
- Managed badge renders on managed Notebooks only (not per-nested-folder).
- Create Notebook is a distinct action from Create Folder; the Create Folder inside an unmanaged Notebook has no managed toggle.
- Context menu on nested folders doesn't expose managed/unmanaged actions.
- Release notes + in-app help explain the rename.
- Render + interaction tests present for the new UX.
- `terminology.md` committed and linked from `invariants.md`.

## Out of scope

- Any backend or schema change (explicitly).
- Full sidebar reorganization (Option 2 in B.5). Keep the current tree view, just relabel.
- Localization — English only.
- Nested Notebooks (Notebook inside a Notebook). Not a concept. If a user wants hierarchy, they use nested folders inside one Notebook.
- Drag-between-clients UX for managed Notebooks (e.g., drag on web → writes on desktop). Phase A handles the correctness path; nicer cross-device UX is a later polish.

## Dependencies

- **Phase A must be complete.** The invariant enforcement is what lets Phase B's UI safely assume "managed is a Notebook-level property."
- No others.

## Estimated effort

| Item | Effort |
|---|---|
| B.0 terminology mapping doc | ~1h |
| B.1 web UI rename | ~3h |
| B.2 desktop UI rename | ~3h |
| B.3 mobile UI rename | ~2h |
| B.4 Create Notebook UX | ~4h (all three clients) |
| B.5 sidebar touch-up (Option 1) | ~2h |
| B.6 onboarding + help | ~2h |
| B.7 affordance cleanup | ~2h |
| B.8 tests | ~3h |
| **Total** | **~2–3 dev days** |

## Commit sequence

1. B.0 — terminology doc.
2. B.1 + B.2 + B.3 — parallel rename passes per client (one commit each).
3. B.7 — affordance cleanup (goes hand-in-hand with B.1/B.2/B.3 but worth a separate commit for reviewability).
4. B.4 — Create Notebook UX on all three clients.
5. B.5 — sidebar touch-up.
6. B.6 — onboarding + help.
7. B.8 — tests.
8. Docs — `invariants.md` updated, README flipped to ✅ done.

## Relationship to Phase 6 (web sync unification)

Phase 6 (web adopts `/sync/push|pull`) is product-gated and orthogonal. Phase B doesn't require it. If Phase 6 happens before Phase B, web will use the sync protocol but still say "Folders"; if Phase B happens first, web will say "Notebooks" but keep using REST. No ordering dependency between them.
