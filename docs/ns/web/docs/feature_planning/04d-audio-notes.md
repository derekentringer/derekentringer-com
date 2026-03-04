# 04d — Audio Notes (Voice-to-Notes)

**Status:** Not Started
**Phase:** 3 — AI & Offline
**Priority:** Medium
**Parent:** [04 — AI Features](04-ai-features.md)

## Summary

AI-enhanced audio-to-notes feature. Users record audio (meetings, lectures, voice memos) directly in the browser. The recording is uploaded to ns-api, transcribed via an external transcription API, then processed by Claude to produce structured, well-formatted markdown notes — not raw transcripts. Claude identifies key points, action items, headings, and organizes content into a readable note.

## Requirements

### Recording
- Microphone button in the editor toolbar (alongside existing AI buttons)
- Browser `MediaRecorder` API to capture audio
- Start/stop/pause controls with visual recording indicator (timer, waveform, or pulsing dot)
- Audio format: WebM/Opus (native browser format, good compression)
- Max recording duration limit (e.g., 30 minutes) to control costs and file size
- Permission prompt handled gracefully (explain why mic access is needed)

### Upload & Transcription
- Upload audio blob to ns-api via `POST /ai/transcribe`
- Server-side transcription via external API (OpenAI Whisper API recommended — good accuracy, simple REST API, reasonable cost)
- Chunking for long recordings if needed (Whisper has 25MB file size limit)
- Return raw transcript to the pipeline (not directly to the user)

### AI Processing (Claude)
- Raw transcript sent to Claude with a structured prompt to produce:
  - **Title** — inferred from content
  - **Headings** — logical sections based on topic changes
  - **Key points** — important information highlighted
  - **Action items** — extracted as a checklist (`- [ ]` markdown)
  - **Clean prose** — filler words, repetition, and verbal tics removed
- Output is well-formatted markdown ready for the editor
- Processing mode options (user-selectable):
  - **Meeting notes** — focuses on decisions, action items, attendees
  - **Lecture notes** — focuses on key concepts, definitions, structure
  - **Voice memo** — lightweight cleanup, preserves personal tone
  - **Verbatim** — minimal processing, just clean transcription

### Note Creation
- Creates a new note with the AI-processed content
- Or appends to the currently selected note (user choice)
- Original audio file optionally stored (future consideration — not MVP)
- Tags auto-suggested based on content (leverages existing 04a auto-tag)

### Settings
- "Audio notes" toggle in AI settings page (default: OFF)
- Processing mode preference (persisted in localStorage)
- Gated on microphone permission availability

## API Design

### `POST /ai/transcribe`
- **Body**: `multipart/form-data` with audio file
- **Auth**: Required
- **Flow**: Upload audio → transcribe via Whisper → process with Claude → return structured note
- **Response**: `{ title: string, content: string, tags: string[] }`
- **Limits**: Max file size (25MB), max duration header for client-side validation

### `GET /ai/transcribe/status`
- **Response**: `{ supported: boolean }` — indicates if Whisper API key is configured
- Used by frontend to show/hide the feature

## Technical Considerations

- **Whisper API** (`POST https://api.openai.com/v1/audio/transcriptions`): model `whisper-1`, accepts webm/mp4/mp3/wav, returns text or JSON with timestamps
- **New env var**: `OPENAI_API_KEY` — required for Whisper (separate from Anthropic key)
- **Cost**: Whisper is $0.006/min; Claude processing adds per-note cost — acceptable for personal use
- **Audio stays server-side**: uploaded, transcribed, then discarded (no permanent audio storage in MVP)
- **Browser compatibility**: `MediaRecorder` supported in all modern browsers; `getUserMedia` requires HTTPS in production (Railway provides this)
- **Large files**: Stream upload to avoid memory issues; consider chunking audio > 25MB
- **Processing time**: Transcription + Claude processing may take 10-30s for long recordings — show progress indicator
- **Existing infrastructure**: Reuses auth, AI service patterns, settings toggle pattern from 04a-04c

## UI Mockup

```
Editor Toolbar:
[Editor | Split | Preview]  [Lines]  [Summarize] [Tags] [Mic]  [Delete]

Recording State:
┌─────────────────────────────────────┐
│  Recording...  ● 00:02:34  [Pause] [Stop] │
└─────────────────────────────────────┘

Processing State:
┌─────────────────────────────────────┐
│  Processing audio...               │
│  ████████░░░░ Transcribing...      │
└─────────────────────────────────────┘

Mode Selection (before recording or in settings):
( ) Meeting notes
( ) Lecture notes
(●) Voice memo
( ) Verbatim
```

## Open Questions

- Should we store the original audio file for playback later, or discard after transcription?
- Should processing mode be selected before each recording, or set once in settings?
- Is there value in showing the raw transcript alongside the processed notes?

## Dependencies

- [04a — AI Features](04-ai-features.md) — reuses AI service patterns, settings toggle, tag suggestions
- [02 — Note Management](../features/02-note-management.md) — creates/updates notes via existing CRUD
- OpenAI API account with Whisper access
