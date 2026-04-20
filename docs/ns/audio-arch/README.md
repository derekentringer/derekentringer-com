# Audio Recording + Transcription Pipeline Hardening Plan

## Goal

Harden the NoteSync audio-recording, chunked-transcription, and note-generation pipeline against edge cases that can lose recordings, corrupt transcripts, silently fail, or leak resources. Specifically:

1. **Resource lifecycle** — ensure temp files, streams, and threads are always cleaned up, even on crash paths
2. **State-machine correctness** — eliminate races in start/stop, chunk assembly, and transcript ordering
3. **Transcription quality** — close gaps in error handling, retry logic, and network stutter resilience
4. **Performance** — reduce unnecessary API calls and optimize chunking for live transcription
5. **Cross-platform parity** — verify macOS (CoreAudio + Process Tap) and Windows (WASAPI via cpal) behave identically

The system is mostly working today (v2.38.0+ with WAV leak fixed); this plan closes remaining edge cases without architectural rewrites.

Hardening scope covers Phases 0–5. Performance and missing-test cleanup are tracked separately (Phases 5–6) so they stay on the radar without muddling the hardening focus.

## Current state

See [`00-architecture-reference.md`](00-architecture-reference.md) for a snapshot of the pipeline as it exists today — key files, data flow, and platform-specific asymmetries.

Post-hardening contract (Phases 1–4 outcomes): [`invariants.md`](invariants.md).

## Phases

| Phase | Status | Goal | Depends on |
|---|---|---|---|
| [0](01-phase-0-test-harness.md) | ✅ core shipped (0.5/0.6 deferred) | Test fixtures for audio I/O, Whisper mocks, Tauri command simulation | — |
| [1](02-phase-1-resource-lifecycle.md) | ✅ shipped (1.0–1.6) | Plug temp file, stream, and thread leaks on all code paths | 0 |
| [2](03-phase-2-state-machine-races.md) | ✅ shipped (2.1–2.6) | Eliminate stop-during-start, start-during-stop, race-prone refs | 0 |
| [3](04-phase-3-transcript-correctness.md) | pending | Fix chunk ordering, dedup, Whisper retry semantics, session cleanup | 0 |
| [4](05-phase-4-performance.md) | pending | Parallelize, deduplicate API calls, optimize live chunking | 1–3 complete |
| [5](06-phase-5-test-coverage.md) | pending | Close test gaps, add integration tests for meeting mode | 1–4 complete |

## Release sequence

```
Phase 0 ──┬── Phase 1 (resource lifecycle) ──┬
          ├── Phase 2 (races)              ──┼── Phase 4 (perf) ── Phase 5 (test coverage)
          └── Phase 3 (transcript correctness) ──┘
```

- Phases 1–3 can run in parallel after Phase 0 lands.
- Phase 4 can start once any Phase 1–3 lands; doesn't block the others.
- Phase 5 (test coverage) is final hardening validation.

## Estimated effort

- Hardening (0–4): ~8–12 dev days
- Test coverage (5): ~3 dev days

## Known fixes already shipped

- **v2.38.0**: WAV temp-file leak (`$TMPDIR/notesync_meeting_*.wav`) fixed via `stop_recording` returning `Vec<u8>` directly instead of path. Startup now runs `cleanup_stale_temp_files()` sweep. Mark as done in Phase 1.

## How to use these docs

Each phase doc is self-contained:

- **Goal** — what this phase fixes
- **Why this matters** — concrete symptoms and incident-style descriptions
- **Items** — specific changes with file:line references, problem statement, and fix description
- **Edge cases** — scenarios the phase must handle correctly
- **Done criteria** — how we know it shipped
- **Out of scope** — adjacent work that belongs in another phase
- **Estimated effort** — hours per item + total

Open issues or feature-planning docs per phase as you pick them up; link back here.

## Key invariants (enforcement via hardening)

After Phase 0–4 are complete, these will always hold:

1. **Temp files removed on all paths** — happy path AND early error returns AND crashes recover via cleanup sweep.
2. **Chunk index monotonic in session** — live transcription chunks always assembled in order, no gaps or duplicates.
3. **Stream stop idempotent** — calling `stop_meeting_recording` twice is safe; second call is a no-op.
4. **Whisper retries are transient-only** — only 502/503/504 retried; 401/400/etc fail fast.
5. **Transcript assembly atomic** — final note never contains partially-transcribed content.
6. **MediaRecorder + tick threads cleaned on unmount** — no RAF callbacks or setInterval leaks.
7. **Cross-platform test parity** — Windows WASAPI and macOS CoreAudio pass identical test fixtures.
