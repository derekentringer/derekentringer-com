# Phase C — Audio Recording & Transcription (mobile)

**Goal**: voice memo + Whisper transcription + AI-structured note,
matching the desktop "memo" / "lecture" / "verbatim" recording modes.
**Meeting mode is desktop-only** (system audio capture isn't
available to user-space apps on iOS/Android), so mobile gets the
mic-only subset.

## What desktop has

- Four modes: `meeting`, `lecture`, `memo`, `verbatim`
- Live waveform UI during recording
- 20-second-chunked Whisper transcription during recording (live
  meeting transcript)
- Final-chunk flush on stop
- AI structuring of the transcript into a titled note with content +
  tags via `structureTranscript`
- pgvector context lookup during recording (Meeting Assistant)
- Snapshot retry / discard for failed sessions

## What mobile needs

A new top-level `RecordingScreen` (or full-screen modal) with:

- Mode picker on entry: `lecture / memo / verbatim` (no `meeting`)
- Record / Pause / Stop controls
- Live waveform via `react-native-skia` or a simpler animated bar
  visualization
- Live transcript view (chunk-by-chunk, same 20s cadence as desktop)
- Save / Discard / Retry on completion

Audio captured via **expo-av** (already in the stack — see
`docs/ns/mobile/docs/PROGRESS.md`).

## Implementation outline

### 1. expo-av recording

`Audio.Recording.createAsync()` with these constraints:

- **Format**: WAV PCM 16kHz mono — same as desktop's Whisper-friendly
  shape
- **Quality preset**: `Audio.RecordingOptionsPresets.LOW_QUALITY`
  modified for 16kHz; mono; PCM
- **Permissions**: request mic permission via
  `Audio.requestPermissionsAsync()` on first recording

### 2. Chunking pipeline

expo-av writes to a single file. To support live chunking, two
options:

- **Option A — periodic flush + concat.** Stop+restart recording
  every 20s, send each chunk to `/ai/transcribe-chunk`, concat
  results in client state. Loses ~50ms per chunk boundary —
  acceptable for transcription.
- **Option B — server-side streaming.** Single long recording, but
  upload it in 20s slices via byte-range reads. More complex.

Recommend **Option A** — simpler, works around expo-av's "single
file per recording session" model.

The desktop pipeline already supports `/ai/transcribe-chunk` so the
server side is free.

### 3. Live transcript view

Same UX as desktop's `LiveTranscript` component: typing-animation
appended, scroll-locked-to-bottom. RN equivalent uses
`Animated.View` + `FlatList` (or `ScrollView` with manual
scrollToEnd).

### 4. AI structuring on stop

When the user taps Stop:
- Final chunk flushes
- Full transcript is sent to `/ai/structure-transcript`
- Server returns `{title, content, tags}` (already exists)
- `createNote` writes locally, queues for sync

Show the user a confirmation / edit screen before saving — same as
desktop's behavior — so they can tweak the AI-generated title /
tags before commit.

### 5. Failure handling

If transcription fails mid-recording:
- Save the raw audio file locally
- Show a "Transcription failed — retry?" sheet on stop
- Tap Retry → re-runs the chunk pipeline against the saved file
- Tap Discard → drops audio + transcript

Mirrors desktop's snapshot-backed retry from
`AudioRecorder.tsx`.

### 6. Background audio

iOS / Android both kill the mic when the app backgrounds unless
configured otherwise:
- iOS: `Audio.setAudioModeAsync({ allowsRecordingIOS: true,
  staysActiveInBackground: true })` + `UIBackgroundModes: audio` in
  Info.plist
- Android: foreground service notification while recording
  (expo-notifications + expo-av background capability)

This is the bulk of the work — getting the platform background
audio dance right.

### 7. Lock-screen / notification controls

While recording is active, show a persistent notification with
`Stop` and `Pause` actions. Tapping Stop ends and saves; Pause
freezes the chunk pipeline. Same notification on iOS lock screen.

## Done criteria

- User picks a mode and records 5+ minutes without issue
- Live transcript updates every ~20s during recording
- Stop produces a structured note with title + content + tags
- Recording survives app backgrounding (e.g., user takes a phone
  call mid-recording)
- Failed transcription falls back to "raw audio + transcript-only"
  note with retry option
- Notification controls work
- Doesn't drain >5% battery per 30 minutes of recording

## Out of scope

- Meeting mode (system audio capture) — platform-blocked
- Speaker diarization / multi-speaker labeling — desktop doesn't
  have it either
- Local Whisper inference — would be incredible but the smallest
  Whisper model is ~150MB and inference on phone is slow. Server
  Whisper is fine.

## Risks / open questions

- **Background audio entitlements.** Both platforms have specific
  hoops; iOS is the harder one. Worth a quick spike before
  committing to the phase.
- **Long recordings + memory.** A 90-minute lecture in 20s chunks =
  ~270 chunks. Need to make sure we're not holding all audio data
  in JS memory; each chunk should upload+free.
- **Network during recording.** What if the user is offline mid-
  recording? Queue chunks locally, transcribe on next online tick.
  More complex; may defer to a Phase C.5 follow-up.
- **Privacy / mic indicator.** iOS shows a system mic indicator
  while recording — fine. But the foreground notification on
  Android needs careful copy so the user understands.
