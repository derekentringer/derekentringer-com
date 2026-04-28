# Phase G — Background Sync via FCM Push (mobile)

**Goal**: when the app is suspended or in the background, the server
can wake it briefly to pull recent changes so the user opens to a
fresh data set instead of a "sync in progress" spinner.

Closes the gap between desktop's always-on SSE connection and
mobile's app-lifecycle-bound sync. Invisible plumbing, but
compounds with everything else — better the user data is, the more
likely they'll use the app.

## Why this matters

Today the mobile sync engine only runs while the app is foreground.
A user who:

1. Opens app on desktop, edits a note, closes app
2. Picks up phone an hour later, opens NoteSync

…sees a "Syncing…" state on launch while the engine catches up.
With background sync, that catch-up happened silently 5 minutes
after step 1.

## What desktop has

Desktop uses SSE: an always-open long-polling connection. Server
pushes notifications via `fastify.sseHub.notify(userId)` on every
mutation, and the desktop client immediately pulls.

That model doesn't work on mobile because the OS suspends the
process and kills the SSE connection within seconds of
backgrounding.

## What mobile needs

Server-side: when `sseHub.notify(userId)` fires, also fire an FCM
data message to the user's mobile device tokens.

Client-side: on receipt of an FCM data message, run a brief
background sync pull, then sleep again.

## Implementation outline

### 1. Device token registration

`expo-notifications` already in stack (per
`docs/ns/mobile/docs/PROGRESS.md`). On login, call
`Notifications.getDevicePushTokenAsync()` and POST it to a new
endpoint `/devices/register`:

```ts
POST /devices/register
{ deviceId: "uuid", token: "fcm-token", platform: "android" | "ios" }
```

A new `Device` table on ns-api stores `(userId, deviceId, token,
platform)`. On logout, `DELETE /devices/:deviceId`.

### 2. Server push fan-out

Modify `fastify.sseHub.notify(userId)` (or wrap it):

```ts
async function notifySyncTargets(userId: string) {
  // Existing: SSE push for desktop / web
  fastify.sseHub.notify(userId);
  // New: FCM data message for each registered mobile device
  const devices = await getDevices(userId);
  for (const d of devices) {
    if (d.platform === "android") {
      await sendFcmDataMessage(d.token, { type: "sync" });
    }
    // iOS: out of scope per CLAUDE.md (no paid Apple Dev account)
  }
}
```

FCM SDK: `firebase-admin` server-side. Already needed for the FCM
push design.

### 3. Client background handler

`expo-notifications`'s `setNotificationHandler` and
`addNotificationReceivedListener`:

- Foreground: notification arrives → just trigger `syncEngine.pullNow()`
- Background (data-only): Android wakes the app briefly via FCM data
  message → `headlessTask` runs `syncEngine.pullNow()` → app sleeps
- App not running at all: data-message wakes a JS context briefly;
  same headless task runs

Configure FCM data messages with `priority: "high"` so Android
honors background wake.

### 4. Throttling / dedup

Server should throttle FCM fan-out — if the user is editing rapidly,
don't fire 50 FCM messages in 30 seconds. A simple per-user
debounce (e.g. one push per 10s window) is fine.

Client should also dedup — multiple FCM messages within the same
sync window collapse to one pull.

### 5. Battery / cost

FCM messages are free, but waking the app burns battery. Mitigations:

- Server throttle (above)
- Client batches multiple wake-ups into one pull
- A "Background sync" toggle in settings (default on; user can
  disable)

### 6. iOS path (deferred)

iOS requires a paid Apple Developer account for APNs (per CLAUDE.md
mobile is Android-only for push). When that changes, swap the
Android-only path for an APNs-aware fan-out.

## Done criteria

- User makes 5 edits on desktop while phone is sleeping
- User opens phone 1 minute later → all 5 edits already on device
- No "Syncing…" spinner on cold open
- Background-sync setting toggles cleanly; off → no FCM wake-ups
- FCM rate-limited to 1 wake per 10 seconds per device

## Out of scope

- iOS push (APNs / paid dev account required)
- Notification UI for mentions / collaborative editing — single-
  user app, no collaboration features
- Battery optimization beyond the basic throttle — premature

## Risks / open questions

- **Headless JS task startup time.** Booting a JS context to run a
  pull burns ~300-500ms. Worth it for a 5KB pull; not worth it for
  a single-byte change. Possibly add a "minimum batch size" hint
  in the FCM payload so the client knows whether to bother.
- **FCM token rotation.** Tokens can rotate at any time. Need a
  listener that re-registers on rotation
  (`Notifications.addPushTokenListener`).
- **Multi-device coordination.** A user with three Android devices
  gets three FCM wake-ups per server change. That's fine — each
  device pulls its own cursor — but worth verifying the deduplication
  on the server side doesn't drop devices.
- **Privacy.** FCM data messages route through Google's
  infrastructure. The payload should be empty / opaque — just a
  "wake up and pull" signal, no note content.
