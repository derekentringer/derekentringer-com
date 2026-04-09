# 42 — Live Meeting Assistant

**Status:** Planned
**Phase:** Phase 3 — AI Differentiation
**Priority:** High

## Summary

During a meeting recording, the app listens in near-real-time and automatically surfaces existing notes that are relevant to what's currently being discussed. This is the "second brain that participates in your meetings" feature — the single most differentiating capability NoteSync can offer.

No competitor does this today. Otter.ai and Fireflies.ai transcribe meetings but only search their own meeting history. Microsoft Copilot in Teams surfaces context from Microsoft 365 but is locked to that ecosystem. Granola.ai produces better post-meeting notes but doesn't retrieve context during the call. NoteSync would be the first tool to connect live meeting audio to a user's personal knowledge base in real-time.

## Architecture Overview

```
Microphone audio (continuous)
        ↓
Chunked every ~20 seconds
        ↓
Streaming transcription (Deepgram WebSocket or Whisper batch)
        ↓
Rolling transcript buffer (last ~2-3 minutes)
        ↓
Every ~45 seconds: generate embedding of recent context
        ↓
Vector similarity search against all note embeddings
        ↓
Filter by relevance threshold (>0.65 score)
        ↓
Surface in Meeting Assistant panel with snippet + match reason
```

## Example Meeting Flow

### Setup

A product manager named Sarah has 200+ notes in NoteSync covering project plans, meeting summaries, research, and personal memos. She's about to join a team meeting about Q3 planning.

She clicks the Meeting recording button in NoteSync. The recording bar appears: `● 0:00 ~~~ Meeting 📁 Work`.

### Minute 0:00–1:00 — Meeting starts

Audio is being recorded. The first 20-second chunk is sent for transcription. The Meeting Assistant panel opens automatically in the right sidebar (where Q&A normally lives).

**Panel shows:**

```
┌──────────────────────────────────┐
│  ● Meeting Assistant             │
│                                  │
│  Listening...                    │
│  Waiting for conversation        │
│  context to build up.            │
│                                  │
│  Your notes will appear here     │
│  when relevant topics come up.   │
└──────────────────────────────────┘
```

No notes are surfaced yet — the system needs ~45-60 seconds of transcript to build enough context.

### Minute 1:00–2:00 — First topic emerges

The team starts discussing the mobile app launch timeline. The rolling transcript now contains:

> "...so the mobile app, we're looking at an August launch. The Android build is in good shape but we still need to figure out the App Store submission process. Sarah, can you walk us through where we are with the TestFlight distribution?"

The system generates an embedding of this context and searches against Sarah's notes. Two notes match above the 0.65 threshold.

**Panel updates (with fade-in animation):**

```
┌──────────────────────────────────┐
│  ● Meeting Assistant             │
│                                  │
│  Discussing: mobile app launch,  │
│  App Store, TestFlight           │
│                                  │
│  ── Related Notes ─────────────  │
│                                  │
│  📄 Mobile Launch Checklist       │
│  "TestFlight requires a paid     │
│  Apple Developer account ($99/   │
│  year). Android sideloading..."  │
│  92% match · Updated 5d ago      │
│                               [→]│
│                                  │
│  📄 App Store Research            │
│  "Submission review takes 24-    │
│  48 hours. Screenshots needed    │
│  for 6.5" and 5.5" displays..." │
│  78% match · Updated 2w ago      │
│                               [→]│
│                                  │
└──────────────────────────────────┘
```

Sarah glances at the panel and sees her own notes about TestFlight requirements — she can immediately reference the $99/year cost without having to search for it manually. She clicks the [→] arrow to peek at the full note in a popover without leaving the meeting view.

### Minute 4:00–5:00 — Topic shifts to budget

The conversation moves on:

> "...the budget for Q3, we need to decide how to split the remaining $40K between marketing and engineering. Last quarter we overspent on the ad campaign and the ROI wasn't great..."

The system detects a topic shift. The previous mobile-related notes fade down and new results appear.

**Panel updates:**

```
┌──────────────────────────────────┐
│  ● Meeting Assistant             │
│                                  │
│  Discussing: Q3 budget,          │
│  marketing vs engineering spend  │
│                                  │
│  ── Just now ──────────────────  │
│                                  │
│  📄 Q2 Budget Retrospective      │
│  "Ad spend was $18K with only    │
│  12 conversions. Cost per        │
│  acquisition: $1,500. Next..."   │
│  88% match · Updated 3d ago      │
│                               [→]│
│                                  │
│  📄 Q3 Planning Draft            │
│  "Proposed split: 60% eng,       │
│  40% marketing. Engineering      │
│  headcount request for..."       │
│  81% match · Updated 1w ago      │
│                               [→]│
│                                  │
│  ── Earlier (mobile launch) ──   │
│                                  │
│  📄 Mobile Launch Checklist       │
│  92% match · Updated 5d ago      │
│  📄 App Store Research            │
│  78% match · Updated 2w ago      │
│                                  │
│  ─────────────────────────────── │
│  💬 Ask about this meeting...    │
└──────────────────────────────────┘
```

Sarah can now reference the exact Q2 ad spend ($18K, 12 conversions) in the discussion without digging through files.

### Minute 12:00 — Sarah asks a question

Sarah types in the chat input at the bottom of the panel:

> "What did we decide about the marketing agency contract last month?"

The system uses the full meeting transcript so far + all her notes as context for a Claude Q&A response. It streams back:

> "In your note **Q2 Budget Retrospective**, you wrote that the team decided to pause the Acme Marketing contract after the 90-day trial ended June 15th. The decision was to bring content creation in-house and only use the agency for paid ad management at a reduced retainer of $3K/month [Q2 Budget Retrospective]."

### Minute 30:00 — Meeting ends

Sarah stops the recording. The system:

1. Transcribes and structures the full meeting as it does today
2. Appends a "Meeting Context" section to the generated note listing all notes that were surfaced during the meeting, with links
3. The meeting note is saved to the selected folder

**Generated meeting note includes:**

```markdown
# Q3 Planning Team Meeting

## Key Discussion Points
- Mobile app launch targeting August...
- Q3 budget split: 60/40 eng/marketing...

## Decisions Made
- Proceed with Android-first launch...
- Reduce marketing agency retainer...

## Action Items
- [ ] Sarah: Submit TestFlight build by July 15
- [ ] Derek: Draft Q3 engineering budget proposal

## Related Notes Referenced
- [[Mobile Launch Checklist]] — TestFlight requirements, app store process
- [[Q2 Budget Retrospective]] — Ad spend analysis, agency contract decision
- [[Q3 Planning Draft]] — Proposed budget allocation
```

## Data Flow & Timing

### Transcription Pipeline

| Event | Timing | What Happens |
|---|---|---|
| Recording starts | t=0s | MediaRecorder begins, Meeting Assistant panel opens |
| First audio chunk ready | t=20s | 20s of audio sent to transcription service |
| First transcript returned | t=22-25s | Text appended to rolling buffer |
| Second chunk sent | t=40s | Next 20s of audio (with 2s overlap) |
| First context search | t=45s | Embedding generated from ~40s of transcript, vector search runs |
| First notes surfaced | t=46-48s | Results appear in panel (if any match >0.65) |
| Ongoing cycle | Every 30-45s | New transcript → updated context → new search → updated results |
| Topic shift detected | Variable | Previous results collapse, new results animate in |
| Recording stops | User action | Full transcript assembled, structured note generated |

### Search Cycle Detail

Each cycle (~45 seconds):

1. **Build context window** — Take last 2-3 minutes of transcript text (~300-500 words)
2. **Generate embedding** — Single API call to Voyage AI (~50ms)
3. **Vector search** — Compare against all note embeddings via cosine similarity (~5ms for 10K notes)
4. **Deduplicate** — Remove notes already shown in previous cycles unless their score increased significantly (>0.1 improvement)
5. **Threshold filter** — Only show notes with score >0.65 (tunable; start conservative to avoid noise)
6. **Topic extraction** — Optional Claude Haiku call to generate 3-5 topic keywords for the "Discussing:" header (~200ms, $0.0005)
7. **Deliver to UI** — Push results to the Meeting Assistant panel via React state update

### What Gets Sent Where

| Data | Destination | Purpose |
|---|---|---|
| 20s audio chunks | Deepgram (WebSocket) or Whisper (REST) | Transcription |
| Rolling transcript (~500 words) | Voyage AI | Embedding for search |
| Rolling transcript (~500 words) | Claude Haiku (optional) | Topic keyword extraction |
| User's question + transcript + note context | Claude Sonnet | Q&A answers |
| Note embeddings | Local/pgvector | Similarity search (no external API) |

## Cost Analysis

### Per-Minute Cost During Meeting

| Component | Cost/Minute | Notes |
|---|---|---|
| Deepgram streaming transcription | $0.0043 | Nova-2 model, WebSocket |
| OR Whisper batch (fallback) | $0.006 | Chunked 20s segments |
| Voyage embedding generation | $0.0001 | Once per cycle (~45s) |
| Vector similarity search | $0.00 | Local computation |
| Claude Haiku topic extraction | $0.0007 | Optional, once per cycle |
| **Total (Deepgram path)** | **~$0.005/min** | |
| **Total (Whisper path)** | **~$0.007/min** | |

### Per-Meeting Cost

| Meeting Length | Deepgram Path | Whisper Path |
|---|---|---|
| 15 minutes | $0.08 | $0.11 |
| 30 minutes | $0.15 | $0.21 |
| 60 minutes | $0.30 | $0.42 |

### Monthly Cost Per User (estimated)

Assuming an average paid user has 8 meetings/month averaging 30 minutes:

- **Deepgram**: 8 x $0.15 = $1.20/month
- **Whisper**: 8 x $0.21 = $1.68/month

At $8/month subscription, this leaves $6.30-6.80 margin before other AI features.

## Transcription Provider Strategy

### Option A: Deepgram WebSocket (Recommended for web)

- **Latency**: <300ms for interim results, <1s for final
- **Quality**: Nova-2 rivals Whisper for English
- **Cost**: $0.0043/min (cheapest)
- **Integration**: WebSocket from client → Deepgram. Server acts as auth proxy only.
- **Pros**: True real-time, interim results ("live typing" effect), speaker diarization
- **Cons**: New vendor dependency, no offline capability

### Option B: Whisper Batch Chunks (Fallback)

- **Latency**: 2-5s per 20s chunk
- **Quality**: Excellent
- **Cost**: $0.006/min
- **Integration**: Already built in NoteSync (just needs chunking)
- **Pros**: No new vendor, proven in codebase
- **Cons**: Higher latency, no interim results

### Option C: Whisper.cpp Local (Desktop only)

- **Latency**: 1-3s per 30s chunk (Apple Silicon, `small` model)
- **Quality**: Good (not as good as large-v3 or Nova-2)
- **Cost**: Free
- **Integration**: Rust sidecar binary or `whisper-rs` crate in Tauri
- **Pros**: Fully offline, zero API cost, privacy
- **Cons**: Desktop only, requires model download (~500MB), lower quality

### Recommendation

Start with **Option B (Whisper batch chunks)** since it's already 80% built. Ship the feature with 3-5s latency and validate that users find it valuable. If they do, upgrade to **Deepgram (Option A)** for sub-second latency. Add **Option C** for desktop as a premium offline feature.

## Implementation Phases

### Phase A: Chunked Transcription Pipeline

**New server endpoint:**
```
POST /ai/transcribe-stream
Body: { audioChunk: Blob, sessionId: string, chunkIndex: number }
Response: { text: string, chunkIndex: number }
```

**Client changes:**
- MediaRecorder with `timeslice` parameter (20s) for `ondataavailable` events
- Send each chunk to server as it arrives
- Maintain a `transcriptBuffer: string[]` that accumulates in order
- Handle out-of-order responses (chunks may return in different order)
- 2-second audio overlap between chunks to prevent word splitting at boundaries

**Effort:** Medium — mostly plumbing, Whisper infrastructure already exists.

### Phase B: Real-Time Note Matching

**New server endpoint:**
```
POST /ai/meeting-context
Body: {
  transcript: string,        // last 2-3 min of rolling transcript
  excludeNoteIds?: string[], // already-surfaced notes to deprioritize
  userId: string
}
Response: {
  topics: string[],          // e.g. ["Q3 budget", "marketing spend"]
  relevantNotes: [{
    noteId: string,
    title: string,
    snippet: string,         // most relevant 1-2 sentences from the note
    score: number,           // 0-1 similarity score
    matchReason: string      // "Discusses Q2 ad spend and agency contract"
  }]
}
```

**Implementation:**
1. Generate embedding of the transcript window
2. Query pgvector for top 10 nearest note embeddings where score > 0.65
3. For each match, extract the most relevant snippet (find the paragraph in the note whose embedding is closest to the query)
4. Optional: Claude Haiku generates `topics` and `matchReason` in a single call
5. Return results

**Effort:** Medium — embedding infrastructure exists, main work is the matching logic and snippet extraction.

### Phase C: Meeting Assistant UI

**New component: `MeetingAssistant.tsx`**

Replaces the Q&A panel in the right sidebar when a recording is active.

**Sections:**
1. **Header** — Recording indicator, "Meeting Assistant" title, minimize button
2. **Topic bar** — "Discussing: Q3 budget, marketing spend" — updates each cycle
3. **Note cards** — Grouped by recency ("Just now", "Earlier"), each card shows title, snippet, score badge, click-to-peek arrow
4. **Collapsed previous topics** — Earlier surfaced notes collapse to single-line entries
5. **Chat input** — "Ask about this meeting..." — sends question + transcript + surfaced notes to Claude for contextual Q&A
6. **Live transcript** (optional, collapsible) — scrolling raw transcript at the bottom

**Interactions:**
- Click note card → popover with full note content (doesn't navigate away from meeting view)
- Click [→] arrow → opens note in a new tab (background, doesn't switch focus)
- Notes appear with a subtle slide-in animation
- Topic shifts cause previous notes to collapse with a smooth transition
- Badge shows "New" for 10 seconds after a note first appears

**Effort:** High — new component, state management for cycling results, animations.

### Phase D: Post-Meeting Integration

After recording stops:
1. Full meeting note is generated (existing flow)
2. Append "## Related Notes Referenced" section with wiki-links to all surfaced notes
3. Save a `meetingContext` record linking the meeting note to all referenced note IDs
4. Future Q&A queries about this meeting can include the referenced notes as additional context

**Effort:** Low — minor additions to existing meeting note generation.

### Phase E: Deepgram Upgrade (Optional)

Replace Whisper batch chunks with Deepgram WebSocket for sub-second latency.

- Server-side WebSocket proxy to Deepgram (keeps API key server-side)
- Client streams raw audio frames via WebSocket to NoteSync server
- Server forwards to Deepgram, receives transcript events, forwards to client
- Enables "live typing" transcript display in the Meeting Assistant panel

**Effort:** High — new WebSocket infrastructure, new vendor, significantly different data flow.

### Phase F: Offline Desktop (Optional)

Integrate whisper.cpp into the Tauri desktop app:

- Bundle or download-on-demand the Whisper `small` model (~500MB)
- Rust-side audio processing: chunk → whisper.cpp → transcript text
- All embedding + vector search done locally via SQLite with vector extension
- Fully offline meeting assistant — no internet required

**Effort:** Very High — new Rust infrastructure, model management, local vector search.

## UI Mockup: Meeting Assistant Panel

```
┌──────────────────────────────────────┐
│  ● Meeting Assistant          [─] [×]│
├──────────────────────────────────────┤
│                                      │
│  Discussing: mobile launch,          │
│  TestFlight, August timeline         │
│                                      │
├──────────────────────────────────────┤
│                                      │
│  ── Just now ──────────────────────  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 📄 Mobile Launch Checklist     │  │
│  │                                │  │
│  │ "TestFlight requires a paid    │  │
│  │ Apple Developer account ($99/  │  │
│  │ year). Android sideloading..." │  │
│  │                                │  │
│  │ 92% · 5d ago              [→]  │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 📄 App Store Research          │  │
│  │                                │  │
│  │ "Submission review takes 24-   │  │
│  │ 48 hours. Screenshots needed   │  │
│  │ for 6.5" and 5.5" displays.." │  │
│  │                                │  │
│  │ 78% · 2w ago              [→]  │  │
│  └────────────────────────────────┘  │
│                                      │
│  ── 3 min ago ─────────────────────  │
│                                      │
│    📄 Team OKRs Q3 · 71%            │
│    📄 Hiring Pipeline · 67%          │
│                                      │
├──────────────────────────────────────┤
│  💬 Ask about this meeting...        │
└──────────────────────────────────────┘
```

## Configuration

Settings for the Meeting Assistant (in AI Settings):

| Setting | Default | Options |
|---|---|---|
| Meeting Assistant | On | On / Off |
| Auto-open panel | On | On / Off (auto-open when recording starts) |
| Relevance threshold | 0.65 | 0.5 (more results) / 0.65 / 0.8 (fewer, higher quality) |
| Search frequency | 45s | 30s / 45s / 60s |
| Show live transcript | Off | On / Off |
| Include in meeting notes | On | On / Off (append referenced notes to generated meeting note) |

## Privacy Considerations

- Audio chunks are sent to Deepgram/OpenAI for transcription — same privacy model as current recording
- Transcript text is sent to Voyage AI for embedding — minimal content, no PII extraction
- Topic extraction via Claude Haiku receives ~500 words of transcript — same vendor as existing AI features
- Note content stays local for vector search (embeddings only, not full text)
- Desktop offline mode (Phase F) keeps everything on-device
- Settings page should clearly explain what data goes where

## Success Metrics

- **Adoption**: % of meeting recordings with Meeting Assistant enabled
- **Engagement**: Average notes surfaced per meeting, click-through rate on surfaced notes
- **Retention**: Users who use Meeting Assistant have higher 30-day retention
- **Value perception**: Conversion rate for users who've experienced Meeting Assistant vs. those who haven't
- **Quality**: User feedback on relevance of surfaced notes (thumbs up/down on cards)

## Competitive Position

This feature fills a gap no competitor has addressed:

| Product | Live Transcription | Surfaces Your Notes | During Meeting | Personal Knowledge |
|---|---|---|---|---|
| Otter.ai | Yes | No | Post-meeting only | Own meetings only |
| Fireflies.ai | Yes (bot) | No | No | Own meetings only |
| Granola.ai | Yes (local) | No | No | No |
| Notion AI | No | Yes (Q&A) | No | Notion workspace |
| MS Copilot Teams | Yes | Yes (M365) | Yes | M365 only |
| **NoteSync** | **Yes** | **Yes** | **Yes** | **Your notes** |

NoteSync would be the only tool that connects live meeting audio to a user's personal markdown knowledge base in real-time, across web and desktop, with an offline option.
