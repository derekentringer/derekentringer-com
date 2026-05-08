# Phase F — Quick Capture Widget + Lock-Screen Actions (mobile)

**Goal**: collapse the friction between "I want to capture
something" and "the app is open and ready." A home-screen widget
(Android) and lock-screen quick action put NoteSync one tap away,
even before the app is foreground.

This is the *mobile-native killer* — desktops don't have this
capture surface, and most note-taking-app failures come from
"capture friction" exceeding the user's mental cost of opening the
app.

## Use cases

1. Walking down the street, idea → tap widget → voice memo records
   immediately, no app launch
2. Waking the phone → lock-screen "New Note" quick action →
   composer opens with keyboard up, ready to type
3. Reading on phone, want to capture quote → home-screen "New
   Note" widget tap → composer opens

## Surface map

### Android home-screen widget

A 1×1 or 2×1 widget with two tap targets:

```
┌──────────────────┐
│  NoteSync        │
│  ┌────┬────┐     │
│  │ +  │ 🎙 │     │  +  → New text note
│  └────┴────┘     │  🎙 → New voice memo
└──────────────────┘
```

Tap launches the app deep-linked into either:
- `notesync://new-note` — opens composer with empty new note
- `notesync://record` — opens recording screen and starts immediately

(Per the no-emojis policy, real widget uses inline icons.)

### Lock-screen quick action

iOS Action Button / Android assistant gesture — both bind to a
deep link. Same `notesync://record` URL, same instant-record UX.

iOS-specific: a Live Activity during recording (Dynamic Island
support) showing recording duration + Stop button.

## Implementation outline

### 1. Android widget (Kotlin/Java)

Expo supports widget extensions via config plugins (community
plugin: `expo-widget` or `react-native-android-widget`). The
widget itself is a small Kotlin component:

- Two `RemoteViews` button regions
- Each fires a `PendingIntent` with our deep-link URL
- App's main activity has an intent filter for `notesync://*` URLs

The widget itself doesn't render dynamic data (e.g., recent notes
list) in v1 — keep it static and tap-to-launch only. Dynamic
widgets are a Phase F.5 extension.

### 2. iOS Live Activity

While a recording is running, post a Live Activity with:
- Recording duration (auto-incrementing)
- Stop button (calls a custom URL scheme that the app handles)

Requires `ActivityKit` (iOS 16.1+). Package
`expo-live-activity` (community) or a custom config plugin.

### 3. Deep-link routing

Single source of truth in React Navigation:

```ts
const linking = {
  prefixes: ["notesync://", "https://ns.derekentringer.com"],
  config: {
    screens: {
      NewNote: "new-note",
      Record: "record",
      NoteDetail: "note/:id",
    },
  },
};
```

Each screen handles its own auto-action: `Record` starts recording
immediately on mount if launched via deep link; `NewNote` focuses
the composer.

### 4. Auth at cold start

Widget tap → deep link → app cold-starts → auth state needs to be
ready before the destination screen renders. The existing
`mobileTokenAdapter` should already handle this, but verify the
cold-start flow doesn't bounce the user to Login first.

### 5. Recording-from-widget UX

If the user taps Record from the widget, the app opens directly to
the RecordingScreen (Phase C) and auto-presses Record. Mode
defaults to `memo` (the user can tap to change before recording
starts via a 1s grace period).

## Done criteria

- Android widget renders, two buttons each launch the right deep
  link
- Tap widget New-Note → composer is up + keyboard focused < 2s from
  cold start
- Tap widget Voice-Memo → recording active, indicator visible
  < 2s from cold start
- iOS Live Activity shows during recording with working Stop button
- Deep links work from outside the app (browser, other apps)
- Cold-start auth doesn't bounce the user to login before the
  intended screen

## Out of scope

- iOS home-screen widget (technically possible via WidgetKit but
  much higher cost than Android; revisit if demand exists)
- Today-view / glances widget (per-platform UI; complex)
- Watch app (way out of scope)
- Dynamic widgets showing recent notes / favorites (Phase F.5
  follow-up if static widget proves popular)

## Risks / open questions

- **Expo managed workflow limits.** Widgets and Live Activities both
  push the limits of what Expo managed supports. May need to bare-
  workflow eject or use config plugins extensively. Spike first
  before committing.
- **Cold-start audio init.** Starting a recording within 1-2s of
  cold start requires the audio session to be ready before
  RecordingScreen mounts. Pre-warm in the app entry point.
- **Auth race.** If the auth refresh happens during cold start and
  fails, the user shouldn't lose their just-tapped intent. Queue
  the deep link, complete auth, then route.
- **Battery drain.** A widget that re-renders dynamic content
  every minute drains battery. Static-only in v1 keeps this
  bounded.
