# Phase C — Audio Recording & Transcription (mobile)

**Goal**: voice memo + Whisper transcription + AI-structured note,
matching the desktop "memo" / "lecture" / "verbatim" recording modes.
**Meeting mode is desktop-only** (system audio capture isn't
available to user-space apps on iOS/Android), so mobile gets the
mic-only subset.

This phase ships in two slices:

- **C.1 — In-app recording.** Full-screen `RecordingScreen`, the
  chunked Whisper pipeline, live transcript, AI structuring on
  stop, plus the foreground-service / background-audio entitlements
  needed to keep the mic alive when the user leaves the screen. A
  persistent notification is the only out-of-app surface in this
  slice.
- **C.2 — Cross-app presence.** Layer in the
  platform-appropriate "keep recording visible while in another app"
  UX on top of the C.1 pipeline: Picture-in-Picture on Android,
  Live Activity (Dynamic Island + Lock Screen) on iOS. No new
  audio plumbing — purely a presentation layer.

C.1 lands the high-value piece (recording works at all) without
being blocked on the platform-specific overlay work, and C.2
layers the cross-app presence once the core pipeline is solid.

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

## UX model

**Primary surface: a full-screen `RecordingScreen`** (mode picker →
record button + waveform + live transcript + stop/pause). On stop, a
review screen shows the AI-structured title / content / tags before
the note is saved. This is the focused recording experience the user
sees while NoteSync is foregrounded.

**When the user leaves NoteSync while a recording is active**, the
platforms diverge:

- **Android → Picture-in-Picture.** The recording UI shrinks to a
  small floating window with a waveform + 2–3 system action buttons
  (Stop / Pause / Resume). This is the canonical Android pattern
  (used by YouTube, Maps) and the only Google-blessed way to draw
  over other apps without invasive permissions like
  `SYSTEM_ALERT_WINDOW`. Plus a foreground-service notification (required
  for mic-while-backgrounded regardless).
- **iOS → Live Activity.** Apple does not allow third-party floating
  windows — period. The closest sanctioned analog, and the one
  Apple's own Voice Memos uses on iOS 17+, is a Live Activity in
  the Dynamic Island (iPhone 14 Pro+) and on the Lock Screen,
  showing recording state + elapsed time. Tap returns to the full
  RecordingScreen. Background audio capability keeps the mic alive.
  No floating window needed or possible.

A shared `useRecordingPresence()` hook gates which platform surface
is invoked when the user backgrounds the app, so JS code stays
platform-agnostic.

### Constraints to know up front

- **Both libs require a custom dev client** — not Expo Go.
- **Android PiP UI is heavily constrained**: ~200×300dp window,
  interactive controls go through `RemoteAction` → `PendingIntent`
  (system-rendered buttons), not React touch handlers. Live
  waveform IS possible (the Activity keeps rendering); plan for
  ≤3 buttons (Stop / Pause / Resume).
- **Live Activities** have a 4KB asset cap. Dynamic Island
  presentation requires iPhone 14 Pro or newer; older iPhones get
  the Lock-Screen presentation only.
- **iPad** doesn't get Live Activities at all — falls back to the
  in-app screen plus a persistent notification.

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
audio dance right. Lands in C.1.

### 7. Lock-screen / notification controls

While recording is active, show a persistent notification with
`Stop` and `Pause` actions. Tapping Stop ends and saves; Pause
freezes the chunk pipeline. Same notification on iOS lock screen.
Lands in C.1 (it's tied to the foreground-service work above).

### 8. Cross-app presence (C.2)

Layered on top of C.1 once the in-app recording works end-to-end.

**Android: Picture-in-Picture via `expo-pip`.**

- `expo-pip` (`EdgarJMesquita/expo-pip`) — Expo config plugin,
  exposes `enterPipMode({ width, height })`, `useIsInPip()`,
  `setPictureInPictureParams()`. Works on arbitrary React views,
  not just video.
- Add to `app.json` plugins; declare
  `<activity android:supportsPictureInPicture="true" />` via the
  plugin.
- The Activity continues rendering inside the PiP window — the
  waveform stays animated. Interactive controls inside the PiP
  must be `RemoteAction`s wired to `PendingIntent`s (NOT React
  buttons). Plan: Stop / Pause / Resume only.
- `expo-video` has its own PiP but it's locked to its video
  surface — not useful for a custom waveform UI.
- Skip: `SYSTEM_ALERT_WINDOW` ("draw over other apps") — Google
  has been steering apps away from it since Android 8, and it's
  invasive enough that we don't want it for a recording UI.

**iOS: Live Activity via `expo-live-activity`.**

- `expo-live-activity` (software-mansion-labs) — Expo config plugin
  that scaffolds the Widget Extension target; JS API for
  `startActivity` / `updateActivity` / `endActivity`. SwiftUI
  layout for the activity itself is hand-written Swift in the
  generated target (one-time setup).
- Requires a dev client; not Expo Go compatible.
- ActivityKit minimums: iOS 16.2+, real device for testing
  (Dynamic Island doesn't render in the simulator on older Xcode).
- For interactive buttons (Stop / Pause inside the Live Activity)
  iOS 17+ and `AppIntent` are required.
- Older library `react-native-widget-extension` (bndkt) is an
  alternative if `expo-live-activity` causes issues.

**Shared JS layer.**

- `useRecordingPresence()` hook subscribes to `AppState`. When the
  app transitions to `background` or `inactive` while a recording
  is active:
  - Android → `enterPipMode({ width: 200, height: 280 })`
  - iOS → `startActivity({ elapsed, mode })`
- On foreground or stop, the inverse (`endActivity` on iOS; PiP
  window naturally collapses when the user returns to the app on
  Android).
- The hook returns `isInPresenceMode` so the in-app UI can render a
  compact view when PiP is active (Android: shrunken layout).

### Not in scope, by platform

- **Android Bubbles**: scoped to messaging notifications; not the
  right tool for recording UI.
- **iOS PiP**: doesn't apply to non-video content in third-party
  apps.
- **iOS floating window**: doesn't exist. Live Activity is the only
  sanctioned cross-app presence pattern.

## Done criteria

### C.1 (in-app recording)

- User picks a mode and records 5+ minutes without issue
- Live transcript updates every ~20s during recording
- Stop produces a structured note with title + content + tags
- Recording survives app backgrounding (e.g., user takes a phone
  call mid-recording) — at minimum via the foreground-service
  notification, with no PiP / Live Activity yet
- Failed transcription falls back to "raw audio + transcript-only"
  note with retry option
- Notification controls (Stop / Pause) work from the lock screen
- Doesn't drain >5% battery per 30 minutes of recording

### C.2 (cross-app presence)

- Android: backgrounding NoteSync mid-recording shows a PiP
  window with a live waveform + Stop / Pause / Resume system
  buttons; tapping back into the PiP returns to RecordingScreen
- iOS: backgrounding mid-recording shows a Live Activity on the
  Lock Screen and (on supported devices) the Dynamic Island, with
  elapsed time + Stop button; tap returns to RecordingScreen
- Older iPhones: Lock Screen presentation works even without
  Dynamic Island
- iPad / Android pre-PiP devices: gracefully fall back to the
  C.1 notification

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
  committing to C.1.
- **Long recordings + memory.** A 90-minute lecture in 20s chunks =
  ~270 chunks. Need to make sure we're not holding all audio data
  in JS memory; each chunk should upload+free.
- **Network during recording.** What if the user is offline mid-
  recording? Queue chunks locally, transcribe on next online tick.
  More complex; may defer to a Phase C.5 follow-up.
- **Privacy / mic indicator.** iOS shows a system mic indicator
  while recording — fine. But the foreground notification on
  Android needs careful copy so the user understands.
- **PiP rendering cost.** The Android Activity keeps rendering at
  full fidelity inside the PiP window; a Skia waveform is fine but
  worth measuring. If frame budget gets tight in C.2, fall back to
  a simpler bar-meter visualization in PiP only.
- **Live Activity push updates.** If we want the Live Activity to
  keep its elapsed-time counter accurate while the JS thread is
  suspended, we need to either pre-compute the end time and let
  the system tick the timer, or send push updates from a server —
  the latter is overkill for a single-device recording. Plan: use
  `Text(timerInterval:)` SwiftUI view so the system updates the
  timer locally.

## Library / dependency summary

| Concern             | Android                           | iOS                                  |
| ------------------- | --------------------------------- | ------------------------------------ |
| Audio capture       | `expo-av` (chunked WAV)           | `expo-av` (chunked WAV)              |
| Background mic      | foreground service notification   | `UIBackgroundModes: audio`           |
| Cross-app presence  | `expo-pip` (PiP)                  | `expo-live-activity` (Live Activity) |
| Lock-screen control | `expo-notifications` + RemoteAction | Live Activity buttons (iOS 17+ AppIntent) |

All four libraries require a custom dev client — already the case
for ns-mobile in this branch.
