# What's New

## v2.42.0

- **Chore** — Bump ns-web to 2.42.0 for release
- **Docs** — Lock bundle identifier to md.notate.app (#572)
- **Docs** — Add detailed NoteSync→Notate migration plan; drop superseded 30-branding doc (#571)
- **Docs** — Drop duplicate planning docs + reflect deleted long-lived branches (#570)
- **Docs** — Bring PROGRESS trackers up to date with shipped features (#569)
- **New** — Phase E.6 — folder picker in share-receiver overlay (#567)
- **New** — Phase E.5 — accept image shares from the OS share sheet (#566)
- **New** — Phase E.4 — paste-to-preview URL enrichment in editor (#565)
- **New** — Phase E.4 — enrich shared URLs via /links/preview (#564)
- **New** — Add /links/preview endpoint for URL metadata extraction (#563)
- **New** — Phase E.3 — append shared content to existing note (#562)
- **New** — Phase E.2 — share-sheet receiver on iOS (#561)
- **New** — Phase E.1 — share-sheet receiver (Android-only spike) (#560)
- **New** — Version-history capture interval setting + Data IA cleanup (#559)
- **Docs** — Promote markdown parity feature to features/ (#558)
- **New** — Markdown parity phase 5b — syntax coloring (#557)
- **New** — Markdown parity phase 5a — code-block chrome (#556)
- **New** — Markdown parity phase 4 — interactive Table of Contents (#555)
- **New** — Markdown parity phase 3 — interactive task checkboxes (#554)
- **New** — Markdown parity phase 2 — wide-table + code-block horizontal scroll (#553)
- **New** — Markdown parity phase 1 — wiki-link rendering + bare URL autolinks (#552)
- **Docs** — Markdown parity phased plan + test fixture
- **Fix** — Generate buildInfo via pretype-check + pretest hooks
- **New** — Settings strings audit + ns-mobile parity polish
- **New** — Material 3 speed-dial FAB + dashboard layout settings
- **Test** — VersionHistoryPanel expects verbose relative-time labels
- **Test** — VersionStore expects origin in create() data
- **Fix** — Strip frontmatter from dashboard + note-list previews
- **New** — Version history rebuild — diff screen on mobile + enriched rows + origin tag
- **Fix** — Quick Actions tiles use fixed width + wrap on narrow screens
- **New** — Themed AppDialog replaces system Alert.alert
- **Fix** — Top-right delete uses ConfirmDialog + keep AI drawer open on note switch
- **Fix** — Restore top spacing for non-recording AI Assistant cards
- **New** — Standardize bottom-sheet backdrops + headers
- **New** — Focus title on new-note + Enter skips frontmatter to body
- **Fix** — Self-heal orphan "processing" meeting cards across all clients
- **New** — Confirm before navigating away during active recording
- **New** — Disable destructive nav buttons during active recording
- **Chore** — Remove dead Rust quit-guard handlers
- **Fix** — Transcript scroll + cross-device chat-clear cleanup
- **New** — Phase H mic-only notice modal + Mic Capture badge
- **New** — Phase H steps 6+7 — web + desktop migration to server-managed jobs
- **New** — Phase H step 4 — migrate stop flow to server-managed jobs
- **Test** — Phase H step 4 — transcription worker tests + dispatch simplification
- **New** — Phase H step 3 — in-process transcription worker + retention sweep
- **New** — Phase H step 2 — transcription-jobs REST endpoints + R2 audio + SSE
- **New** — Phase H step 1 — transcription_jobs schema + store helpers
- **Docs** — Phase H — Server-managed transcription jobs
- **New** — Phase H groundwork — chunked stop-time transcribe + Whisper provider config
- **New** — Phase D.1 — image upload from camera + library
- **New** — Mobile stop-flow polish + Retry/Discard parity + MD3 icon spacing
- **New** — Dashboard parity — quick-action recording modes, Resume Editing on mobile, mobile AI settings
- **New** — Cancel recording on web/desktop, drop pause on mobile, audio file cleanup
- **New** — Chat timestamps in AI Assistant + cross-device persistence fix
- **Fix** — Web/desktop crash on mobile-originated meeting cards + open related notes by default
- **New** — Pgvector-backed related notes on meeting cards
- **New** — Meeting-summary cards round-trip through chat history
- **New** — Meeting card transcript + related-notes collapsibles
- **Fix** — Stream audio uploads via FileSystem.uploadAsync
- **Fix** — Use expo-file-system/legacy + don't fail on getInfoAsync
- **Chore** — Instrument processRecording for ERR_NETWORK debugging
- **revert** — Drop the 5-min audio request timeout
- **Fix** — Meeting card matches web/desktop + 5min timeout
- **New** — Cross-screen recording handoff via meeting card
- **New** — Stop now creates a structured note (pulls C.1.3 forward)
- **Fix** — Drop chunk loop — single-shot transcribe on stop
- **Fix** — Send audio/mp4 (not audio/m4a) for Android chunks
- **Fix** — Chunk uploads send proper multipart boundary
- **Fix** — Chunk loop reads live recorder state, not stale closure
- **New** — Phase C.1.2 — chunked transcription + live transcript
- **Fix** — Drop post-stop alert + don't poke a released recorder
- **New** — Live waveform visualization during recording
- **New** — Surface meeting mode in recording mode picker
- **New** — Phase C.1.1 — recording shell + expo-audio
- **Docs** — Expand Phase C plan with cross-app UX (PiP / Live Activity)
- **Fix** — Pull-side soft-delete inserts missing rows
- **New** — Position AI empty state ~1/3 down the screen
- **New** — Show "Edit Note - Preview" title in preview mode
- **Fix** — Hide AI items in editor overflow during preview
- **New** — Move AI summarize + suggest tags into overflow menu
- **New** — Move detail copy-link into overflow menu
- **New** — Move trash into editor overflow menu
- **New** — Move frontmatter toggle into header overflow menu
- **Fix** — No animation on tag card mount
- **Fix** — Surface AI tag/summary failure cases + await flush
- **Fix** — Show tag shimmer + new tags past the 2-row clamp
- **New** — Shimmer loading state in summary + tag cards
- **Fix** — Make summary card actually animate in height
- **Fix** — Card height + sibling layout animate together
- **Fix** — Swap LayoutAnimation for Reanimated layout transitions
- **New** — Animate summary + tag card expand/collapse
- **New** — Phase B.2 — AI Suggest Tags
- **New** — Phase B.1 — AI Generate Summary + tag/summary card parity
- **Fix** — Editor folder picker — drop All Notes, show Unfiled selected (#531)
- **Fix** — Preview parity — hr rendering, wiki-links, h1 spacing (#530)
- **Fix** — Theme heading colors + add top spacing in preview (#529)
- **New** — Hide frontmatter in detail + toggleable in editor (#528)
- **Fix** — Clear stuck confirmation spinner + render citation markers as superscript (#527)
- **Fix** — Stop FlatList jitter during keyboard transitions (#526)
- **New** — IMessage-style bubble entry animation across web/desktop/mobile (#525)
- **Fix** — AI Assistant keyboard avoidance + per-env SQLite (#524)
- **Fix** — Chat history hydration race could wipe server state (#523)
- **Fix** — Remove manual sync icon from Notes header (#522)
- **Fix** — Make Settings screen scrollable (#521)
- **Fix** — Confirmation cards — Apply runs the tool, batch into one card, survive cross-device refetch (#520)
- **Fix** — Card style parity + keyboard avoidance (#519)
- **New** — Phase A.5.1 — cross-device chat refetch via SSE (#518)
- **New** — Phase A.6 — settings + auto-approve + AI helpers (#517)
- **New** — Phase A.5 — chat persistence + history-aware follow-ups (#516)
- **New** — Phase A.4 — confirmation cards for destructive tools (#515)
- **New** — Phase A.3 — slash commands + typeahead picker (#514)
- **New** — Phase A.2 — tools, citations, source pills, note cards (#513)
- **New** — Phase A.1 — AI chat foundation + basic streaming (#512)
- **Docs** — Restore phased plan as reference for deferred work (#511)
- **Docs** — Seed develop-ns-mobile-parity with phased plan

## v2.41.0

- **Chore** — Bump ns-web to 2.41.0 for release
- **Fix** — Emptying trash now writes tombstones so other devices sync (#508)
- **Fix** — Cmd+Option+letter shortcuts work on macOS again (#507)
- **Fix** — Strip emojis from every AI response (#506)
- **Fix** — Global modifier-key shortcuts fire from text inputs (#505)
- **Fix** — Friendly error on rename name collision (no 500) (#504)
- **Fix** — Order Meeting mode first + restyle font-size picker (#503)
- **Fix** — Correct phrasing when auto-approve runs the action (#502)
- **Fix** — Keep panel mounted across drawer-tab + stable auto-scroll (#501)
- **New** — Add rename_note tool, /rename command, settings toggle (#500)
- **Refactor** — Rename note "Delete" → "Move to Trash" everywhere (#499)
- **Fix** — Keep title visible when Claude uses [Title] brackets (#498)
- **Fix** — Rewritten note reloads in the open editor (#497)
- **Fix** — E.5 citations match bare/bold titles, not just [brackets] (#496)
- **New** — Prompt history survives /clear
- **Fix** — Drop leading space in citation replacement so bold-wrapped titles render
- **Fix** — Citation markers render as <button>, not <a href="#">
- **Fix** — E.5 citations also match noteCards, not just Q&A sources
- **Fix** — Teach Claude the [Title] citation convention in the system prompt
- **Fix** — /savechat now preserves noteCards + Q&A sources as wiki-links
- **New** — Up/Down arrow cycles through prior chat prompts (10-entry history)
- **Fix** — Strict title match for destructive tools — no fuzzy-fall-back
- **Fix** — Defer chat input re-focus past React render cycle
- **Fix** — Retain focus on chat input after send
- **Fix** — Persist pending confirmation cards across panel unmount
- **New** — Unified/split toggle in AI confirmation Preview modal
- **Fix** — Rename_folder passed folder.id as oldName (silent no-op)
- **Fix** — Guard hidden frontmatter from cursor entry + delete-through
- **Fix** — Line numbers stay after toggling frontmatter visibility
- **Fix** — Atomic chat persistence — eliminate refresh-mid-save data-loss race
- **Fix** — Strip empty assistant placeholders anywhere in the chat, not just trailing
- **Fix** — Line numbers toggle works when frontmatter is hidden
- **Fix** — Preserve DB metadata in frontmatter on content-only updates
- **Fix** — Keep embedded frontmatter in sync when editor saves title + content
- **Fix** — Strip YAML frontmatter from sidebar note blurbs
- **Fix** — Persist confirmation cards across refresh + strip stale empties
- **New** — Preview diff modal on confirmation card + cleanup empty placeholders
- **Fix** — Bump max_tokens 1500 → 8192 + detect mid-call truncation
- **New** — Move thinking indicator inline at bottom of conversation
- **Fix** — Guard update_note_content against missing content (data-loss fix)
- **New** — Phase E extras — chat export + inline citation markers
- **New** — Phase E — thinking indicator, retry, Cmd+J focus
- **New** — Phase D — cost logging + per-question budget + persistence tuning
- **New** — Phase C.4 + C.5 — bulk grouping + per-tool auto-approve
- **New** — Phase C — destructive-action confirmation UX
- **New** — Phase B — cross-notes search
- **ci** — Run on develop-ai-assist long-lived branch too
- **New** — Phase A — conversation continuity
- **Docs** — Seed long-lived branch with phased hardening + expansion plan

## v2.40.0

- **Chore** — Bump ns-web to 2.40.0 for release
- **New** — Add File → Exit on Windows/Linux for close-guard parity
- **Fix** — Swizzle applicationShouldTerminate: for macOS Dock Quit
- **Fix** — Stop close-guard dialog looping when user confirms
- **Fix** — Own the macOS Quit menu item (PredefinedMenuItem::quit cannot be intercepted)
- **Fix** — Intercept macOS Cmd+Q via RunEvent::ExitRequested
- **Fix** — Reliable close-while-processing guard on macOS Cmd+Q
- **Fix** — Broaden close-while-processing guard to cover recording + stop half
- **New** — Phase 3 — beforeunload warning while processing (parity)
- **New** — Phase 3 — close-while-processing warning
- **New** — Phase 2 — in-card failure UX with retry + discard (parity)
- **New** — Phase 2 — in-card failure UX with retry + discard
- **New** — Phase 1 — detach audio processing (parity with desktop)
- **New** — Phase 1 — detach audio processing from recorder state
- **Fix** — Remove 'Start Managing Locally' from note context menu
- **Fix** — Don't re-fire recording on AudioRecorder remount

## v2.39.0

- **Chore** — Bump ns-web to 2.39.0 for release
- **Test** — Stub Element.scrollTo for jsdom
- **Fix** — Sticky-bottom scroll for live meeting transcript
- **Fix** — Make Meeting Recording card flush with AI Assistant panel edges
- **Fix** — Prevent app-level scroll shift when AI posts new messages
- **New** — Final-chunk flush on stop + re-land Phase 4.1 dedup
- **revert** — Phase 4.1 + Rust audio_capture changes — keep TS hardening only
- **New** — Phase 5 — test coverage completion (5.1–5.6)
- **New** — Phase 4 — performance hardening (4.1–4.5)
- **New** — Phase 3 — transcript correctness (3.1–3.6)
- **New** — Phase 2 — state-machine race hardening (2.1–2.6)
- **New** — Phase 1 — resource lifecycle hardening (1.0–1.6)
- **Docs** — Mark Phase 0.1–0.4 shipped; defer 0.5/0.6 rest to JIT
- **Test** — Phase 0.4 — mic-only happy-path integration test
- **Test** — Phase 0.3 — MediaRecorder + Tauri mocks
- **Test** — Phase 0.1 + 0.2 — Whisper mock + Rust audio fixture
- **Docs** — Audio-arch hardening plan (Phase 0–5)
- **Docs** — Document `npm run release` flow in CLAUDE.md
- **Chore** — Add `npm run release` script for one-command releases
- **Fix** — Tauri dev now shows the latest git-tag version

## v2.38.0

- **Chore** — Bump ns-web to 2.38.0 for audio-leak-fix release
- **Fix** — Stop leaking meeting-recording WAVs to \$TMPDIR

## v2.37.0

- **Chore** — Bump ns-web to 2.37.0 for sticky-sidebar-header release
- **New** — Sticky headers on FAVORITES + TAGS tabs
- **New** — Sticky header + filter input, matching notes panel
- **Chore** — Bump displayed version to 2.36.0

## v2.36.0

- **Fix** — Make embedding queue a static import
- **New** — Phase 5.2 — upload queued images in parallel
- **New** — Phase 5.1 — dedup embedding queue on pull
- **Fix** — Backfill orphan notes' folderId to null
- **Refactor** — Flip tray-arrow icons upward for consistency
- **Refactor** — Rename "Title" option to "Name" for consistency
- **New** — Sort + filter UI to match notes list
- **Fix** — Hybrid collision strategy so notes can drop on folders in stacked sidebar
- **Fix** — Unfiled view now paginates correctly on server
- **New** — Toast note's destination on drop
- **New** — Port stacked-sidebar resize + new-note button to web
- **New** — Make folders/notes stacked divider draggable
- **New** — Remove Manual sort
- **Fix** — Manual-sort drag sticks and stops bumping updatedAt
- **Fix** — Remove drop ring from notes
- **New** — Note drag preview now includes snippet, tags, and correct managed-icon color
- **New** — Drag preview mirrors the source item's layout
- **Fix** — Shrink DragOverlay wrapper to card's natural content width
- **Fix** — Card fills DragOverlay wrapper so snapCenterToCursor centers on content
- **Fix** — Pin DragOverlay center to cursor via snapCenterToCursor
- **New** — Unify note + folder drag-and-drop UX across web and desktop
- **Refactor** — Remove "Move to Root" context menu option
- **Fix** — Hide "Move to Root" for managed folders on web + desktop
- **Fix** — Start Managing Locally only appears on root folders
- **Fix** — Phase A.5 — run disk reconciler inline on desktop-initiated cross-boundary move
- **Docs** — Phase A complete — invariants updated, phase doc + README marked
- **Test** — Phase A.8 — end-to-end cross-boundary round-trip
- **New** — Phase A.7 — coerce isLocalFile on pull to match root
- **Refactor** — Phase A.6 — drop managedFolderIds Set, use folder.isLocalFile
- **New** — Phase A.5 — cross-boundary move detection + dialog
- **New** — Phase A.3 — cross-boundary move dialog wired to 409
- **New** — Phase A.4 — pull-side disk reconciler on isLocalFile flip
- **New** — Phase A.2 — moveFolder cross-boundary 409 + confirmCrossBoundary
- **New** — Phase A.1 — server enforces isLocalFile root-ancestor invariant
- **New** — Phase A.0 — normalize folders.isLocalFile to root ancestor
- **Fix** — Bump package.json to 2.35.0 + env-var fallback for Railway

## v2.35.0

- **Fix** — Guard MarkdownEditor scrollDOM assignment in RAF callback
- **Test** — Fix pre-existing NoteList managed-icon title mismatch
- **Docs** — Phase A + Phase B plans (Notebook model)
- **Fix** — Managed icon is flag-driven only (drop heuristic fallback)
- **Fix** — Drive managed-locally folder icon from folder.isLocalFile
- **Fix** — Reconciliation only deletes isLocalFile=true folders
- **Fix** — Folder responses + REST createFolder both carry isLocalFile
- **Fix** — Managed-locally folder delete always recursive
- **Fix** — Managed-locally folder delete always recursive
- **Fix** — MoveToTrash descendant managed folders on tombstone
- **Fix** — Don't bump trash badge on hard-deleted managed-locally notes
- **Fix** — Tombstone on REST note hard-delete for managed-locally
- **Docs** — Mark Phase 4 complete
- **New** — Tombstone sweep + admin maintenance route (Phase 4.5)
- **Docs** — Add sync-arch + invariants pointers to CLAUDE.md (Phase 4.4)
- **Docs** — Invariants reference (Phase 4.3)
- **Fix** — Correct DIR_RECONCILE_INTERVAL_MS comment (Phase 4.2)
- **New** — Composite (userId, updatedAt) indexes (Phase 4.1)
- **Docs** — Mark Phase 3 complete
- **New** — Watcher gap detection via poll-timer (Phase 3.5)
- **New** — Proper unmanage-directory flow (Phase 3.4)
- **New** — Pending_refs referential deferral (Phase 3.2)
- **Fix** — Hash-based watcher self-write dedup (Phase 3.1)
- **Docs** — Mark Phase 2 complete
- **Fix** — Server-authoritative LWW on /sync/push (Phase 2.3)
- **New** — Keyset pagination on (updatedAt, id) (Phase 2.2)
- **Fix** — Per-change transactions on /sync/push (Phase 2.1)
- **Docs** — Mark Phase 1 complete + Phase 4 tombstone sweep
- **New** — Managed-locally warning on folder delete (Phase 1.6)
- **New** — Process tombstones on sync pull (Phase 1.5 client)
- **New** — Tombstones for hard-deleted entities (Phase 1.5 server)
- **New** — REST folder delete hard-deletes managed folders (Phase 1.4)
- **New** — One-time backfill flags existing managed folders (Phase 1.3)
- **New** — Stamp isLocalFile on managed-directory folders (Phase 1.2)
- **New** — Add Folder.isLocalFile flag + wire round-trip (Phase 1.1)
- **Docs** — Mark Phase 0 complete; wire turbo test:integration
- **Test** — Add Phase 3 reference tests for robustness bugs
- **Test** — Add Phase 2 reference tests for sync correctness bugs
- **Test** — Add file-watcher test fixture for Phase 3
- **Test** — Add two-client sync fixture with demo tests
- **Test** — Add user/device/auth fixtures for integration tests
- **Test** — Scaffold integration test harness with testcontainers
- **Docs** — Add multi-phase sync hardening plan
- **New** — Hard-delete folders on sync push delete
- **New** — Hard-delete locally managed notes on server
- **Fix** — Remove accent ring from folder rename input
- **Chore** — Update Cargo.lock for trash crate
- **Fix** — Skip LocalFileDeleteDialog for managed files
- **New** — Desktop delete moves managed files to OS trash
- **Fix** — Reconciliation does local-only cleanup, no sync deletes
- **Fix** — Detect and skip stale sync deletes for re-added files
- **Fix** — Re-enable local file deletion on remote note delete
- **Refactor** — Reconciliation-only indexing, no watcher creation
- **New** — Hard-delete folders for locally managed directories
- **Fix** — Run managed directory setup even with 0 local notes
- **New** — OS trash + hard-delete for locally managed files
- **Fix** — Clean up stale notes and prevent duplicate restoration
- **Fix** — Prevent sync round-trip file deletion and note duplication
- **Fix** — Show managed-locally icon on all folders in managed tree
- **Fix** — Show delete toast even when reconciliation already processed
- **Fix** — Fetch note title from DB for delete toast
- **New** — Stacked toast notifications with per-toast undo
- **Fix** — Preserve dashes/underscores in titles derived from filenames
- **Fix** — Clean up debug logs from folder remote delete handler
- **Fix** — Fire folder delete callback before soft-delete
- **New** — Delete local files/directories on remote sync delete
- **Fix** — Drop old non-partial folder unique index
- **Fix** — Flip import icon arrow to point down matching desktop
- **Fix** — Make createFolder fully idempotent
- **Fix** — Restore soft-deleted folders instead of creating duplicates
- **Fix** — Pass locallyHostedNoteIds to sidebar inline note list
- **New** — Highlight managed-locally icon in accent color on hosting device
- **New** — Differentiate managed-locally icon from desktop
- **New** — Show managed-locally icon on folders in sidebar
- **New** — Move managed-locally icon next to folder picker on both platforms
- **New** — Add managed-locally icon to folder breadcrumb on both platforms
- **New** — Match desktop managed-locally icon for local file notes
- **Fix** — Recursive folder sync for nested subdirectories
- **Fix** — Reliable folder sync via disk-based reconciliation
- **Fix** — Simplify directory watcher back to watch() with state checks
- **Refactor** — Use native OS rename events instead of buffer heuristics
- **Fix** — Industry-standard file watching with periodic reconciliation
- **Fix** — Folder rename/delete sync to disk, directory create debounce
- **New** — UI polish for local file management
- **New** — Folder structure mirroring for managed directories (feature 30)
- **New** — Rename and move detection for managed directories (feature 29)
- **New** — External delete handling for managed directories (feature 28)
- **New** — Folder/note context menus for local file management
- **New** — Startup reconciliation and directory watcher integration
- **New** — Add startup reconciliation for managed directories
- **New** — Add directory watching infrastructure (feature 27)
- **New** — Web parity + UI polish for frontmatter, summary, and tags
- **New** — Frontmatter editor UX — toggle, fold, highlight, summary
- **Fix** — Use CSS line decorations instead of Decoration.replace for frontmatter fold
- **New** — Add Properties panel with frontmatter fold extension
- **Docs** — Add feature plan 26b for frontmatter properties panel
- **New** — Add frontmatter data migration for existing notes
- **New** — Integrate frontmatter into desktop note create/update flows
- **New** — Integrate frontmatter into note create/update flows
- **New** — Add frontmatter parser/serializer with tests
- **Docs** — Add feature plans 26-30 for advanced local file management

## v2.34.0

- **Fix** — Refresh trash count badge after sync pulls in trashed items on fresh install

## v2.33.0

- **Fix** — Sync trashed items that were never synced while active

## v2.32.0

- **Chore** — Sync tauri.conf.json version
- **Chore** — Update RELEASE_NOTES for v2.26–v2.31

## v2.31.0

- **Fix** — Drop foreign key constraint on images.note_id

## v2.30.0

- **Fix** — Sync pull cursor must respect per-type pagination boundary

## v2.29.0

- **Fix** — Folder sync — pagination cursor + drop client FK

## v2.28.0

- **Fix** — Make local builds deterministic across platforms
- **Chore** — Sync ns-web package.json version to 2.27.0

## v2.27.0

- **Fix** — Read version from package.json with git tag sync

## v2.26.0

- **Fix** — Version display fixes for web and desktop builds
- **Fix** — Fix version display on local dev and Railway production
- **Fix** — Use numeric pre-release identifier for dev builds
- **New** — Local dev builds append -dev to version
- **Chore** — Add tauri:build:win script mirroring macOS tauri:build
- **Chore** — Remove slate.json, add to gitignore

## v2.25.0

- **New** — Active note context for AI, configurable Claude model, plugin API updates

## v2.24.0

- **Fix** — Recording bar pulse uses theme primary color

## v2.23.0

- **New** — Teams theme, theme-aware editor/logo/favicon, tab indicator fix

## v2.22.0

- **New** — Update About dialog with What's New and Feedback navigation

## v2.21.0

- **Fix** — Strip trailing slashes on all routes

## v2.20.0

- **New** — Auto-generate release notes on build, fix About page

## v2.19.0

- **New** — Redesign Settings with sidebar nav, grouped sections, admin integration
- **Refactor** — Remove transcription mode from Settings, default to meeting source

## v2.18.0

- **Live recording card** — Recording context (Related Notes + Transcription) now appears as a sticky card in the AI Assistant chat during recording
- **Settings redesign** — macOS-style sidebar navigation with grouped sections, custom accent color picker, font size dropdown
- **Cross-device chat sync fix** — Linked note cards now appear correctly when chat syncs across devices
- **Windows file association** — NoteSync registers as a handler for .md, .txt, and .markdown files on Windows
- **Recording improvements** — Meeting mode is now the default recording source; transcription mode removed from Settings (use ribbon buttons instead)

## v2.17.0

- **Audio level hook** — Replaced hidden AudioWaveform canvas with lightweight `useAudioLevel` hook
- **Verbatim mode labels** — Updated to "Verbatim Recording" / "Verbatim Saved"

## v2.16.0

- **Recording card in chat** — Moved Related Notes and Transcription into a sticky card within the chat messages area
- **Recording bar redesign** — Pulsing round dot replaces square dot in stop button
- **Clear button** — Moved into AI Assistant header bar

## v2.15.0

- **Windows meeting audio** — WASAPI-based system audio capture for Windows desktop
- **About dialog fix** — Desktop About dialog now renders correctly
