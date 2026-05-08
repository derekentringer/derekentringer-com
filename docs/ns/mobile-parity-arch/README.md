# NoteSync Mobile Parity — Phased Plan

This long-lived branch (`develop-ns-mobile-parity`) tracks the work to
bring `ns-mobile` up to parity with `ns-web` / `ns-desktop` on the
features that make sense for a phone, plus the **mobile-native**
features that don't have a desktop equivalent.

## Current state

The notes engine on mobile is **at parity** with desktop: full
offline SQLite via expo-sqlite, FTS5 search, the same sync protocol
(push / pull / tombstones / SSE-equivalent / outbox queue), backlinks,
version history, trash, folders, tags. Auth, settings, and the basic
editor work.

The big gap is **everything AI-flavored** — `AiScreen.tsx` is a
placeholder, audio recording is unbuilt, image upload is unbuilt,
and there are no inline AI editor actions. There's also no
mobile-native capture surface (share sheet, widget, camera) that would
make the app feel mobile-first instead of mobile-port.

The existing mobile feature backlog at
[`docs/ns/mobile/docs/PROGRESS.md`](../mobile/docs/PROGRESS.md) tracks
two named phases — `05 — AI Features` and `07 — Audio Recording &
Transcription` — but doesn't sequence the rest. This branch picks up
from there with a phased rollout, ordered by user value × cost, and
adds mobile-specific killers as their own phases.

## Phases

| # | Phase | Brief | User value | Cost |
|---|-------|-------|------------|------|
| A | [AI Assistant chat](./phase-a-ai-chat.md) | Replace `AiScreen.tsx` placeholder with a real chat: streaming, tools, slash commands, citations, confirmation cards, source pills | Very high — the single biggest gap | Medium-high. UI translation; API already shared. |
| B | [Inline AI editor actions](./phase-b-inline-ai.md) | Continue Writing, AI Rewrite, AI Tags, AI Summary — surfaced via the existing markdown toolbar / bottom-sheet pattern | High — small, contained, reuses existing endpoints | Low-medium. |
| C | [Audio recording + transcription](./phase-c-audio.md) | Mic-only voice memos with chunked Whisper transcription. AI-structured note generation. (No meeting-mode system audio — not feasible on phone.) | Very high — phone is the most natural recording surface | Medium-high. expo-av + chunk pipeline + AI structuring. |
| D | [Image upload from camera roll / camera](./phase-d-images.md) | Pick photo, upload to R2, AI-describe, insert into note | High — natural mobile UX; opens up scan / receipt / whiteboard workflows | Medium. R2 client + image picker + insertion UI. |
| E | [Share sheet integration](./phase-e-share-sheet.md) | Receive text / URLs / images from any app → "Save as note" / "Append to note" / "Save to folder" | High — capture-from-anywhere is mobile-native | Medium. expo-sharing + share-extension target. |
| F | [Quick capture widget + lock-screen actions](./phase-f-widget.md) | Android home-screen widget: tap → new note, tap → voice memo. Lock-screen quick action for instant voice capture. | High — friction is the killer for mobile capture | Medium-high. Android widget (Java/Kotlin native module). |
| G | [Background sync via FCM push](./phase-g-bg-sync.md) | Server triggers an FCM data message → app wakes briefly to pull, so notes are fresh when the user reopens. Closes the gap with desktop's always-on SSE. | Medium-high — invisible but compounds with everything else | Medium. FCM is already in the stack; just need wiring. |

## What's intentionally NOT in this branch

These don't make sense on mobile:

- Live preview / split / preview view-mode toggling (no screen real estate)
- Command palette / Cmd+P / Cmd+J shortcuts (modifier keys aren't a mobile concept)
- Meeting-mode system-audio capture (OS-blocked; mics only)
- Tabs (mobile is one-note-at-a-time)
- Focus mode (the whole UI is already focused)
- Local file management / managed directories (no equivalent)
- Drag-and-drop image insertion (replaced by Phase D's picker)

These will track separately and may show up later:

- iOS push notifications (requires paid Apple Developer account; not in scope)
- Handwriting / Apple Pencil ink → markdown (deep platform integration; future idea)

## Recommended starting cadence

**Phase A first** — `AiScreen.tsx` being a placeholder is the most
visible gap. The chat UX translates more directly from desktop than
the audio pipeline does, and most of the work is React Native
component shape, not protocol design.

**Phase B in parallel or right after A** — small, reuses the existing
backend, gets immediate value into the existing editor. Good "filler
PR" cadence.

**Phase C next** — audio is the highest-leverage *mobile-native*
feature; once it lands, mobile becomes the canonical recording
surface for the whole product (phones are with you, desktops are at
desks).

**Phases D / E / F** can ship in any order based on demand. Phase E
(share sheet) is the lowest-cost UX killer of the three.

**Phase G last** — invisible plumbing, only worth it after enough
other features exist to justify the always-fresh-on-open
behavior.

## Branch model

Mirrors `develop-ai-assist` and `develop-sync-mgmt`: long-lived
`develop-ns-mobile-parity` off `develop`. Per-phase feature branches
off this branch, merged via PR, then `develop-ns-mobile-parity`
rolls up to `develop` when each phase or batch is ready.

## Cross-references

- Mobile progress tracker: [`docs/ns/mobile/docs/PROGRESS.md`](../mobile/docs/PROGRESS.md)
- Existing AI architecture (web/desktop): [`docs/ns/ai-assist-arch/`](../ai-assist-arch/)
- Sync engine (already at parity): [`docs/ns/sync-arch/`](../sync-arch/)
- Mobile package: `packages/ns-mobile/`
- AI tool catalog (shared with all clients): `packages/ns-api/src/services/assistantTools.ts`
