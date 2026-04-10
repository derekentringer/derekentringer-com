# 25 — Live Meeting Assistant

## Summary

Real-time AI meeting assistant that surfaces relevant notes during audio recordings and saves meeting transcripts as note metadata. Integrates into the existing AI Assistant panel — during recording, a "Meeting Assistant" section appears above the chat with live-surfaced notes and a scrollable transcription view.

## Architecture

### Chunked Transcription Pipeline (Phase A)
- During recording, audio is chunked every 20 seconds and sent to `POST /ai/transcribe-chunk` for incremental Whisper transcription
- Web: MediaRecorder `ondataavailable` chunks accumulated, sent as WebM blobs
- Desktop mic mode: same MediaRecorder approach
- Desktop meeting mode: Rust `get_meeting_audio_chunk` command reads new PCM data from both system + mic temp files, mixes to 16kHz mono WAV, returns bytes
- Chunk transcripts accumulate in an ordered map (`transcriptChunksRef`), assembled via `getOrderedTranscript()`
- `liveTranscript` React state updated on each chunk return, exposed on `AudioRecordingState`
- Full audio blob still sent to Whisper on recording stop for highest quality final note

### Real-Time Note Matching (Phase B)
- `useMeetingContext` hook polls `POST /ai/meeting-context` every 45 seconds during recording
- Uses last 2000 chars of live transcript as context window
- Server generates query embedding via Voyage AI, performs pgvector cosine similarity search (threshold 0.65)
- `findMeetingContextNotes()` returns scored notes with clean snippets
- Deduplicates previously surfaced notes via exclude set
- Results accumulate over the recording session

### AI Assistant Integration (Phase C)
- Meeting context section appears in the AI Assistant panel (formerly QA Panel) during recording
- Collapsible with chevron toggle
- "RELATED NOTES" header with document icon — note cards with title + score percentage
- Status text: "Listening for conversation context..." (pre-transcript), "Monitoring the [mode] to surface related notes..." with bouncing dots (searching)
- "TRANSCRIPTION" header with mic icon — scrollable, resizable (60–400px), typing animation
- Resize divider matches app's ResizeDivider style
- Auto-opens AI Assistant drawer when recording starts
- Chat placeholder changes to "Ask about this meeting..." during recording
- "Catch me up" button above chat input — sends full transcript to Claude for concise meeting summary (visible only during recording with transcript, hidden while streaming)
- Live Q&A: during recording, chat questions are sent with the live transcript as context via optional `transcript` field on `/ai/ask`; uses `answerMeetingQuestion` with meeting-specific system prompt
- When recording stops, dynamic "Recording Ended" card inserted into chat:
  - Header adapts to recording mode: "Meeting Ended", "Lecture Ended", "Memo Saved", "Recording Ended"
  - Shows bouncing dots + "Generating note..." while processing
  - Once note is created: clickable note title, up to 3 key topic pills (extracted from mode-specific section headings), related notes, expandable transcript
  - `completedNote` prop enriches the card when `handleAudioNoteCreated` fires
- Chat bubble styling: compact `chat-markdown` CSS override (13px, line-height 1.5, no padding), tighter message gaps (8px)

### Post-Meeting Integration (Phase D)
- Related notes appended as `## Related Notes Referenced` with wiki-links
- Related notes captured in `lastRelevantNotesRef` to survive recording state reset (prevents empty refs)
- Desktop: wiki-links saved via direct server PATCH (not local `updateNote`) to avoid FTS UNIQUE constraint on notes not yet in local SQLite
- Raw transcript saved to `transcript` database column (nullable text)
- Transcript saved directly via `apiFetch` PATCH in AudioRecorder's `onstop` handler
- Transcript button (mic icon) on note toolbar — visible for audio notes with transcript
- TranscriptViewer: read-only view replacing editor area, close button (X) to return

### Chat History Persistence (Phase E)
- Server-side chat storage in `chat_messages` PostgreSQL table (id, userId, role, content, sources JSON, meetingData JSON, createdAt)
- API: `GET /ai/chat-history`, `POST /ai/chat-history` (batch append), `DELETE /ai/chat-history`
- Load on mount, debounced save (1s) after messages change (skipped during streaming)
- Clear button clears both local state and server
- SSE real-time sync: `notifyChat()` sends `event: chat` to other devices; `chatRefreshKey` triggers refetch
- Typing tips animation below chat: cycles through randomized tips, hidden when chat has messages

### Agentic Tool Use (Phase F)
- Claude tool_use API for structured note queries and actions (up to 3 tool rounds per question)
- **Read tools**: `search_notes`, `list_folders`, `list_tags`, `get_note_stats`, `get_recent_notes`, `get_note_content`, `get_backlinks`
- **Action tools**: `create_note` (with AI-generated template content), `move_note`, `tag_note`, `generate_tags`, `generate_summary`, `delete_note`, `delete_folder`
- All tools scoped to `request.user.sub` — no cross-user data access
- Tool activity SSE events: `{ tool: { name, description } }` shown as bouncing dots status in chat
- Note card SSE events: `{ noteCards: [...] }` rendered as interactive clickable cards below Claude's answer
- System prompt instructs Claude on when to use tools vs answer directly

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/ai/transcribe-chunk` | POST | Transcribe single audio chunk (multipart: file + sessionId + chunkIndex) |
| `/ai/structure-transcript` | POST | Structure pre-transcribed text + create note (JSON: transcript + mode + folderId) |
| `/ai/meeting-context` | POST | Find notes relevant to transcript (JSON: transcript + excludeNoteIds + threshold) |
| `/ai/chat-history` | GET | Fetch all chat messages for the user |
| `/ai/chat-history` | POST | Append chat messages (batch) |
| `/ai/chat-history` | DELETE | Clear all chat messages |

## Database Changes

### PostgreSQL (ns-api)
- Migration `20260409000000_add_transcript`: `ALTER TABLE notes ADD COLUMN transcript TEXT`
- Migration `20260410000000_add_chat_messages`: `CREATE TABLE chat_messages` (id, userId, role, content, sources JSONB, meetingData JSONB, createdAt)
- Prisma schema: `transcript String?` on Note model, `ChatMessage` model
- noteStore: `updateNote` handles transcript field
- notes route: PATCH schema accepts `transcript`
- mappers: `toNote` includes transcript

### SQLite (ns-desktop)
- Migration 012: `ALTER TABLE notes ADD COLUMN transcript TEXT`
- `NoteRow` interface includes transcript
- `rowToNote` reads transcript from row
- `upsertNoteFromRemote` stores transcript in UPDATE and INSERT

## Components

| Component | Package | Purpose |
|---|---|---|
| `AIAssistantPanel` | ns-web, ns-desktop | Renamed from QAPanel; integrated meeting context + chat |
| `TranscriptViewer` | ns-web, ns-desktop | Read-only transcript display with close button |
| `FolderPicker` | ns-web, ns-desktop | Reusable folder dropdown (also used in recording bar) |

## Hooks

| Hook | Package | Purpose |
|---|---|---|
| `useMeetingContext` | ns-web, ns-desktop | Polls meeting-context API during recording, accumulates results |

## Rust Changes (ns-desktop)

- `audio_capture.rs`: `get_audio_chunk()` — reads incremental PCM from system + mic temp files, mixes, resamples to 16kHz WAV, returns bytes; `read_pcm_since()` seeks to byte offset for incremental reads; `RecordingState` tracks `sys_chunk_read_pos` / `mic_chunk_read_pos`
- `lib.rs`: `get_meeting_audio_chunk` Tauri command registered

## Tests

- All 1,918 tests passing (611 ns-web + 861 ns-desktop + 446 ns-api)
- Test helpers updated with `transcript: null` across all packages
- `syncDb.test.ts` updated for transcript parameter in upsertNoteFromRemote
