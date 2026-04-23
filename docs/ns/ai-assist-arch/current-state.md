# AI Assistant — Current State (baseline for hardening)

Factual map of the assistant as of `main` at `v2.40.0`. No recommendations here — those live in the phase docs.

## 1. Chat request flow

User input flows from the panel (`askQuestion` in `packages/ns-desktop/src/components/AIAssistantPanel.tsx:761` — same shape in `ns-web`), posting via SSE to `POST /ai/ask` (`packages/ns-api/src/routes/ai.ts:216`). The request body contains only:

- the current question
- optional live transcript (capped at 50,000 chars)
- optional active note (title + content, capped at 50,000 chars)

**NOT sent**: prior chat history, prior tool-use context, citations from earlier turns.

Each request spawns a fresh Claude conversation with `MAX_ROUNDS = 3` tool-use rounds (`packages/ns-api/src/services/aiService.ts:461`). The route detects client disconnect and aborts the stream via socket close listener (`ai.ts:231`). Tool results are accumulated across rounds and re-sent at stream end to ensure persistence (`ai.ts:269`). No explicit per-call timeout; `AbortSignal` is threaded for client-side abort.

## 2. Tools exposed to Claude

Twenty tools in `packages/ns-api/src/services/assistantTools.ts`:

**Read-only (8)**
- `search_notes` — keyword search on titles + FTS over content; returns titles/folders/tags/snippets (no content body). *Hybrid/semantic modes exist in the underlying `noteStore.listNotes` filter but are NOT currently exposed via this tool.*
- `list_folders` — folder tree with counts
- `list_tags` — tags with note counts
- `get_note_stats` — summary statistics
- `get_recent_notes` — most recently edited
- `get_note_content` — full content of one note by title (truncated at 3,000 chars if larger)
- `get_backlinks` — notes linking to a target via `[[wiki-links]]`
- `open_note` — returns a clickable note card (UI-only side effect)

**Destructive / mutating (11)**
- `create_note`, `update_note_content` (requires full text), `move_note`, `tag_note` (appends), `delete_note` (soft), `delete_folder`, `toggle_favorite`, `restore_note`, `rename_folder`, `rename_tag`, `duplicate_note`

**AI chains (2)**
- `generate_tags`, `generate_summary` — re-enter aiService

**No confirmation UX** — Claude can invoke any mutation directly.

## 3. Slash commands

Twenty-one commands in `packages/ns-desktop/src/lib/chatCommands.ts` (same file in `ns-web`). All execute locally (no Claude involved). Each has a matching Claude tool except:

| Slash | Note |
|-------|------|
| `/clear` | client-side chat history clear only; no Claude equivalent (intentional) |
| `/favorites` | handled by `toggle_favorite` + listing, no direct tool |
| `/favorite` + `/unfavorite` | both map to `toggle_favorite` |

**Gaps in the other direction** (tool exists, no slash):
- `get_backlinks`
- `update_note_content`

## 4. Chat persistence

Chat history is persisted on every message-state change via debounced (1s) full-replace to the server (`AIAssistantPanel.tsx:378–394`). Endpoint: `POST /ai/chat/save`, retrieval via `GET /ai/chat`. Storage: `packages/ns-api/src/store/chatStore.ts` using Prisma.

Serialized fields per message: `role`, `content`, `sources` (QASource[] — reference pills), `meetingData` (phase-2 audio-session card), `noteCards` (tool-result note cards). All JSON columns.

**Multi-device sync**: SSE `chatRefreshKey` prop triggers a full refetch from the server. Phase-2 chat-load repaint: any persisted `status: "processing"` card gets relabeled to `failed` with "Recording lost on refresh" (`AIAssistantPanel.tsx:310–324`).

**Used as context for Claude**: No. Historical messages are NOT sent back to Claude; only the current question is passed (see §1). Each turn is stateless except for the 3-round tool-use loop within a single call.

## 5. System prompt injection

For Q&A (`answerWithTools`, `aiService.ts:470–486`):

- **Active note** — title + full content sliced to 10,000 chars, verbatim
- **Live transcript** — full content (no client-side slice beyond the 50k request-body cap)
- **Slash command names** listed as "tips when relevant"
- **Tool-use guidance** — general description of capabilities

No compression, no summarization, no selective inclusion — raw string slicing is the only truncation.

## 6. Semantic search infrastructure

Already built, partially used:

- **Embeddings**: Voyage AI `voyage-3-lite`, 4,000-char input cap (`packages/ns-api/src/services/embeddingService.ts`)
- **Indexer**: background loop every 60s, rate-limited to 22s between calls for Voyage's 3 RPM free tier (`packages/ns-api/src/services/embeddingProcessor.ts`)
- **Storage**: pgvector column on `Note` table
- **Search modes**: `keyword`, `semantic`, `hybrid` all implemented in `packages/ns-api/src/store/noteStore.ts:299–345, 1264–1301`
- **Thresholds**: semantic 0.3, hybrid 0.4, meeting-context 0.65
- **`findMeetingContextNotes`** (`ai.ts:464–514`): server-side semantic recall used during live recording to surface related notes in the ribbon. **Not exposed as a Claude tool** — so Claude can't invoke it outside a meeting.

The user-facing `semanticSearch` setting in `useAiSettings.ts:29–43` is **dead code** — no call site reads it.

## 7. AI settings

Stored in `localStorage` via `packages/ns-desktop/src/hooks/useAiSettings.ts`:

- `masterAiEnabled` — global kill switch
- Feature toggles: `completions`, `continueWriting`, `summarize`, `tagSuggestions`, `rewrite`, `qaAssistant`, `audioNotes`
- `completionStyle` — continue/markdown/brief/paragraph/structure
- `semanticSearch` — declared but unreferenced (see §6)
- Audio: `audioMode`, `recordingSource`

No admin UI visible. No per-model selection exposed to users.

## 8. Error handling & retries

Transient Claude API errors (502, 503, 504, 529) trigger **2 retries** with exponential backoff (`1s * attempt`) inside `aiService.ts`. Whisper / audio transcription errors are mapped to user-friendly messages via `getAiErrorMessage()` (status code lookup, `aiService.ts:235–246`).

Failed Claude calls are **not cached**; no request-level idempotency. Errors log via Fastify's `request.log.error()` with the error object + message. No Sentry / external observability wired in.

## 9. Cost / token controls

Max tokens per call:

| Operation | `max_tokens` |
|-----------|--------------|
| Completions | 50–500 (style-dependent) |
| Summary | 150 |
| Tags | 100 |
| Rewrite | 200–800 |
| Transcript structuring | 8,192 |
| Q&A (`answerQuestion`) | 1,000 |
| Q&A with tools (`answerWithTools`) | 1,500 |
| Image analysis | 300 |

Retries capped at 2 + initial = 3 calls per non-tool request. Tool-use loop hard-capped at 3 rounds; each round is an independent 1,500-token call (no cumulative budget across rounds).

**No visible rate limiting to users.** Embedding processor respects Voyage free tier (3 RPM) via delays. No per-user ceiling on Claude spend.

## 10. Telemetry / observability

Fastify request logger (`request.log.info()` / `.error()`) emits:

- Embedding processor: note ID + file size
- Transcription: session ID, chunk index, file size
- Meeting context search: transcript length

**Not logged**: Claude token usage (input/output/cached), tool-use round counts, per-user Claude call counts, per-question cost. No external observability backend (no Sentry / DataDog / OpenTelemetry exporter).

## Appendix — canonical file pointers

| Subsystem | Path |
|-----------|------|
| Chat panel (desktop) | `packages/ns-desktop/src/components/AIAssistantPanel.tsx` |
| Chat panel (web) | `packages/ns-web/src/components/AIAssistantPanel.tsx` |
| Slash registry | `packages/ns-desktop/src/lib/chatCommands.ts` (web mirrored) |
| API routes | `packages/ns-api/src/routes/ai.ts` |
| Claude service | `packages/ns-api/src/services/aiService.ts` |
| Assistant tools | `packages/ns-api/src/services/assistantTools.ts` |
| Note store (search) | `packages/ns-api/src/store/noteStore.ts` |
| Embedding service | `packages/ns-api/src/services/embeddingService.ts` |
| Embedding indexer | `packages/ns-api/src/services/embeddingProcessor.ts` |
| Chat persistence | `packages/ns-api/src/store/chatStore.ts` |
| AI settings hook | `packages/ns-desktop/src/hooks/useAiSettings.ts` |
