# 02a — Scheduler API

**Status:** Planned
**Phase:** 1 — Plugin API Foundation
**Priority:** Medium

## Summary

A `host.scheduler` API that allows plugins to schedule future actions — delayed tasks, recurring intervals, and time-based notifications. Without this, plugins that need timers, reminders, polling, or deferred work must implement their own scheduling with `setInterval`/`setTimeout` and manage persistence themselves. The Scheduler API provides a unified, persistent, cross-platform scheduling system with automatic cleanup on plugin deactivation.

## Why This Belongs in Phase 1

Several planned plugins depend on scheduling:
- **Reminders** — trigger notifications at specific times
- **Google Calendar** — poll for upcoming events at intervals
- **Git Backup** — commit on a configurable interval
- **Daily Journal** — auto-create note on app open / at a specific time
- **Embeddings** — background processing queue

Without a host-provided scheduler, every plugin implements its own timer logic, persistence, and cleanup. The scheduler API standardizes this and handles edge cases (app restart, sleep/wake, timezone).

## API Design

```typescript
export interface SchedulerAPI {
  /**
   * Schedule a one-time task to run after a delay.
   * Returns a task ID for cancellation.
   */
  scheduleOnce(
    id: string,
    delayMs: number,
    callback: () => void | Promise<void>,
  ): string;

  /**
   * Schedule a task to run at a specific date/time.
   * Persisted — survives app restart.
   * Returns a task ID for cancellation.
   */
  scheduleAt(
    id: string,
    date: Date,
    callback: () => void | Promise<void>,
  ): string;

  /**
   * Schedule a recurring task at a fixed interval.
   * Returns a task ID for cancellation.
   */
  scheduleInterval(
    id: string,
    intervalMs: number,
    callback: () => void | Promise<void>,
  ): string;

  /**
   * Cancel a scheduled task by ID.
   */
  cancel(id: string): void;

  /**
   * Cancel all scheduled tasks for this plugin.
   */
  cancelAll(): void;

  /**
   * List all active scheduled tasks for this plugin.
   */
  list(): ScheduledTask[];
}

export interface ScheduledTask {
  id: string;
  type: "once" | "at" | "interval";
  /** When the task will next fire (null for cancelled) */
  nextRun: Date | null;
  /** For interval tasks, the interval in ms */
  intervalMs?: number;
}
```

## Persistence

### Transient Tasks (`scheduleOnce`, `scheduleInterval`)

- Managed in-memory with `setTimeout`/`setInterval`
- Lost on app restart — plugins re-register them in `activate()`
- Auto-cancelled on plugin `deactivate()`

### Persistent Tasks (`scheduleAt`)

- Stored in the plugin's data storage (SQLite on desktop/mobile, server-side for web)
- Survives app restart — on startup, the scheduler checks for due/overdue tasks and fires them
- Overdue tasks (scheduled time has passed while app was closed) fire immediately on next startup

```typescript
// Storage schema for persistent tasks
interface PersistedScheduledTask {
  id: string;
  pluginId: string;
  scheduledAt: string; // ISO date
  fired: boolean;
  createdAt: string;
}
```

### Platform Differences

| Platform | Transient | Persistent | Notifications |
|---|---|---|---|
| Web | `setTimeout`/`setInterval` | Server-side storage, checked on SSE reconnect | Browser Notification API |
| Desktop | Same + Tauri timers | SQLite storage, checked on app launch | Tauri notification plugin |
| Mobile | Same | SQLite storage, checked on app open | Push notifications (Android only) |
| CLI | `setTimeout` | Not applicable (CLI is short-lived) | stdout message |

## Notifications

The scheduler integrates with platform notifications for time-based alerts:

```typescript
export interface SchedulerAPI {
  // ... scheduling methods above ...

  /**
   * Schedule a notification at a specific time.
   * Uses platform-native notifications (browser Notification API, Tauri notifications, mobile push).
   */
  scheduleNotification(
    id: string,
    date: Date,
    options: NotificationOptions,
  ): string;
}

export interface NotificationOptions {
  title: string;
  body: string;
  /** Optional: open this note when notification is clicked */
  noteId?: string;
  /** Optional: execute this command when notification is clicked */
  commandId?: string;
}
```

## Auto-Cleanup

All scheduled tasks are scoped to their plugin. On `deactivate()`:
- All transient timers (`scheduleOnce`, `scheduleInterval`) are cleared automatically
- Persistent tasks (`scheduleAt`) remain unless explicitly cancelled (they should still fire even if the plugin was temporarily disabled)

This mirrors the hook system's auto-cleanup pattern — plugins don't need manual teardown.

## Sleep/Wake Handling

When a device sleeps and wakes:
- `setTimeout`/`setInterval` may drift or skip
- On wake, the scheduler checks all persistent tasks and fires any that are overdue
- Desktop: Tauri's `resumed` event triggers the check
- Web: `visibilitychange` event triggers the check

## Example Usage

```typescript
// Reminder plugin
export default class ReminderPlugin implements Plugin {
  register(host: NoteSync) {
    host.commands.registerSlashCommand({
      name: "setreminder",
      description: "Set a reminder — /setreminder 3pm Review PR",
      execute: async (args) => {
        const { time, message } = parseReminderArgs(args);
        host.scheduler.scheduleNotification(
          `reminder-${Date.now()}`,
          time,
          { title: "Reminder", body: message },
        );
        return { text: `Reminder set for ${formatTime(time)}: ${message}` };
      },
    });
  }
}

// Git Backup plugin
export default class GitBackupPlugin implements Plugin {
  activate(host: NoteSync) {
    const interval = settings.commitInterval * 60 * 1000;
    host.scheduler.scheduleInterval("git-commit", interval, () => {
      this.commitAndPush();
    });
  }
}

// Google Calendar plugin
export default class GoogleCalendarPlugin implements Plugin {
  activate(host: NoteSync) {
    host.scheduler.scheduleInterval("event-poll", 60_000, () => {
      this.checkUpcomingEvents();
    });
  }
}
```

## Tasks

- [ ] Define `SchedulerAPI` and `ScheduledTask` types in `@notesync/plugin-api`
- [ ] Implement transient scheduling (`scheduleOnce`, `scheduleInterval`) with auto-cleanup
- [ ] Implement persistent scheduling (`scheduleAt`) with storage backend
- [ ] Implement `scheduleNotification` with platform-native notification dispatch
- [ ] Sleep/wake detection and overdue task firing
- [ ] Add scheduler to the `NoteSync` host interface
- [ ] Tests: scheduling, cancellation, persistence, overdue firing, auto-cleanup
