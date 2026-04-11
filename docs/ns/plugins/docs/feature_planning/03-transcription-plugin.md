# 03 — Transcription Plugin

**Status:** Planned
**Phase:** 2 — Extract Built-in Plugins
**Priority:** High

## Summary

Extract audio transcription (Whisper) and transcript structuring (Claude) into `@notesync/plugin-transcription`. First built-in plugin to validate the plugin architecture. Currently hardcoded in `whisperService.ts`, `aiService.ts`, and `audioChunker.ts`.

## Current Implementation (to extract)

| File | Responsibility |
|---|---|
| `services/whisperService.ts` | Whisper API calls, retry logic, chunked transcription |
| `services/audioChunker.ts` | ffmpeg audio splitting for files >24MB |
| `services/aiService.ts` | `structureTranscript()` — Claude formatting by mode |
| `routes/ai.ts` | `/ai/transcribe`, `/ai/transcribe-chunk`, `/ai/structure-transcript` endpoints |

## Plugin Structure

```
packages/ns-plugin-transcription/
  src/
    index.ts              # Plugin class, register + activate
    manifest.json         # Plugin manifest
    whisper.ts            # Whisper API client
    chunker.ts            # Audio splitting
    structurer.ts         # Claude transcript structuring
    routes.ts             # Fastify route registration
  package.json
  tsconfig.json
```

## Plugin Registration

```typescript
export default class TranscriptionPlugin implements Plugin {
  manifest = require("./manifest.json");

  register(host: NoteSync) {
    // Register as AI provider
    host.services.register("transcription", {
      transcribe: this.transcribe.bind(this),
      transcribeChunk: this.transcribeChunk.bind(this),
      structureTranscript: this.structureTranscript.bind(this),
    });
  }

  activate(host: NoteSync) {
    // Register routes within plugin's Fastify context
    host.registerRoutes((fastify) => {
      fastify.post("/transcribe", ...);
      fastify.post("/transcribe-chunk", ...);
      fastify.post("/structure-transcript", ...);
    });
  }
}
```

## Extensibility

Other plugins could replace the transcription provider:
- `@notesync/plugin-deepgram` — Use Deepgram instead of Whisper (with speaker diarization)
- `@notesync/plugin-assemblyai` — Use AssemblyAI
- `@notesync/plugin-local-whisper` — Run Whisper locally via whisper.cpp

Each would register the same `transcription` service interface, and the host routes to whichever is active.

## Settings

```json
{
  "provider": "whisper",
  "whisperModel": "whisper-1",
  "maxRetries": 2,
  "chunkSizeBytes": 25165824,
  "structureModel": "claude-sonnet-4-20250514",
  "structureMaxTokens": 8192
}
```

## Tasks

- [ ] Create `packages/ns-plugin-transcription/`
- [ ] Move whisperService, audioChunker, structureTranscript into plugin
- [ ] Define `TranscriptionService` interface in plugin-api
- [ ] Register routes via plugin Fastify context
- [ ] Register service for other plugins to consume
- [ ] Replace hardcoded imports in ns-api with service lookup
- [ ] Verify all transcription tests still pass
