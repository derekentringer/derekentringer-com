# 07 — Audio Recording & Transcription

**Status:** Not Started
**Phase:** 3 — AI & Audio
**Priority:** Medium

## Summary

Record audio on mobile and transcribe it into a structured note via ns-api (Whisper for transcription, Claude for structuring). Supports four modes: meeting, lecture, memo, and verbatim. Matches the audio recording feature in web and desktop.

## Requirements

- **Audio recorder**:
  - Record button accessible from the note list screen (microphone icon in the header or FAB menu)
  - Recording UI: elapsed time, waveform/level indicator, pause/resume, stop
  - Audio format: WebM or M4A (platform-dependent; must be one of the server-accepted types: `audio/webm`, `audio/mp4`, `audio/mpeg`, `audio/wav`, `audio/ogg`)
  - Maximum recording length: configurable (default 60 minutes)
  - Recording continues when screen is locked or app is backgrounded
- **Audio mode selection**:
  - Before or during recording, select transcription mode:
    - **Meeting**: structured meeting notes with attendees, key points, decisions, action items
    - **Lecture**: organized notes with key concepts, definitions, summary
    - **Memo**: cleaned-up personal memo with fixed grammar and organized paragraphs
    - **Verbatim**: minimal processing, close to original speech
  - Default mode configurable in AI settings
- **Transcription flow**:
  - On stop: show "Transcribing..." progress indicator
  - Upload audio to `POST /ai/transcribe` as multipart form data (file + mode)
  - Server handles: Whisper transcription → Claude structuring → note creation
  - On success: navigate to the newly created note
  - On failure: show error with retry option; audio file preserved locally for retry
- **Offline handling**:
  - Recording works offline
  - Audio saved locally; queued for transcription when back online
  - Visual indicator: "Audio saved — will transcribe when online"
- **Audio permissions**:
  - Request microphone permission via expo-av
  - Show rationale if permission denied
  - Gracefully handle permanent denial (link to device settings)

## Technical Considerations

- Use `expo-av` for audio recording (cross-platform, handles permissions)
- Recording format: prefer `audio/mp4` (AAC) for broad compatibility; fall back to `audio/webm` if needed
- Large audio files (>25MB) are automatically chunked by the server's `transcribeAudioChunked` function
- Server retries on transient Whisper/Claude errors (502/503/504/529)
- Client-side retry on 502/503/504 responses (up to 2 retries with backoff)
- Keep recorded audio in local file system until transcription succeeds, then clean up
- Consider `expo-file-system` for managing temporary audio files
- Bottom sheet for mode selection matches the pattern used by other AI features

## Dependencies

- [00 — Project Setup & Auth](00-project-setup-and-auth.md) — needs API connection
- [05 — AI Features](05-ai-features.md) — audio mode setting stored with AI settings

## Open Questions

- Should the app support recording system audio (e.g., phone calls), or microphone only?
- Maximum file size before warning the user?
- Should completed audio recordings be retained for re-transcription, or deleted after success?
