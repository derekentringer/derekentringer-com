# 23 — Example Plugin: Google Calendar

**Status:** Planned
**Phase:** Example Plugins
**Priority:** Medium
**Plugin Type:** `integration`

## Summary

Connects NoteSync to Google Calendar to auto-create meeting notes before events and link notes to calendar entries. Demonstrates external API integration, OAuth authentication, scheduled background tasks, and the NotesAPI.

## Manifest

```json
{
  "id": "notesync-google-calendar",
  "name": "Google Calendar",
  "version": "1.0.0",
  "description": "Auto-create meeting notes from Google Calendar events",
  "author": "NoteSync",
  "hostApiVersion": "^1.0.0",
  "type": "integration",
  "requiresPlaintext": false,
  "platforms": ["web", "desktop"],
  "settings": {
    "schema": {
      "calendarIds": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Calendar IDs to watch"
      },
      "minutesBefore": { "type": "number", "description": "Create note X minutes before event" },
      "folder": { "type": "string", "description": "Folder for meeting notes" },
      "template": { "type": "string", "description": "Template for meeting notes" },
      "autoTag": { "type": "boolean", "description": "Auto-tag with attendee names" }
    },
    "defaults": {
      "calendarIds": ["primary"],
      "minutesBefore": 5,
      "folder": "Meetings",
      "template": "default",
      "autoTag": true
    }
  }
}
```

## Plugin Implementation

```typescript
import type { Plugin, NoteSync } from "@notesync/plugin-api";

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime: string };
  end: { dateTime: string };
  attendees?: { email: string; displayName?: string }[];
  hangoutLink?: string;
  location?: string;
}

export default class GoogleCalendarPlugin implements Plugin {
  manifest = require("./manifest.json");
  private host!: NoteSync;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private createdNotes: Set<string> = new Set(); // Track event IDs with notes

  register(host: NoteSync) {
    this.host = host;

    host.commands.register({
      id: "gcal:create-for-next",
      name: "Create Note for Next Meeting",
      callback: () => this.createForNextEvent(),
    });

    host.commands.register({
      id: "gcal:create-for-today",
      name: "Create Notes for Today's Meetings",
      callback: () => this.createForToday(),
    });

    host.commands.register({
      id: "gcal:connect",
      name: "Connect Google Calendar",
      callback: () => this.authenticate(),
    });
  }

  async activate(host: NoteSync) {
    // Load previously created note tracking
    const tracked = await host.settings.get<string[]>("createdEventIds");
    if (tracked) tracked.forEach((id) => this.createdNotes.add(id));

    // Poll for upcoming events every minute
    this.pollTimer = setInterval(() => this.checkUpcomingEvents(), 60 * 1000);

    // Initial check
    await this.checkUpcomingEvents();
  }

  async deactivate() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    // Persist tracked event IDs
    await this.host.settings.set("createdEventIds", [...this.createdNotes]);
  }

  // --- Authentication ---

  private async authenticate() {
    // OAuth 2.0 flow for Google Calendar API
    // Opens browser window for consent, stores refresh token in encrypted settings
    const authUrl = this.buildOAuthUrl();
    this.host.workspace.openExternalUrl(authUrl);
    // After redirect, exchange code for tokens
  }

  private async getAccessToken(): Promise<string> {
    const tokens = await this.host.settings.getEncrypted<{
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
    }>("oauth_tokens");

    if (!tokens) throw new Error("Not authenticated. Run 'Connect Google Calendar' first.");

    if (Date.now() > tokens.expiresAt) {
      // Refresh the access token
      const refreshed = await this.refreshAccessToken(tokens.refreshToken);
      await this.host.settings.setEncrypted("oauth_tokens", refreshed);
      return refreshed.accessToken;
    }

    return tokens.accessToken;
  }

  // --- Event Polling ---

  private async checkUpcomingEvents() {
    try {
      const token = await this.getAccessToken();
      const settings = await this.host.settings.get<{
        calendarIds: string[];
        minutesBefore: number;
      }>("settings");

      const minutesBefore = settings?.minutesBefore ?? 5;
      const now = new Date();
      const soon = new Date(now.getTime() + minutesBefore * 60 * 1000);

      for (const calendarId of settings?.calendarIds ?? ["primary"]) {
        const events = await this.fetchEvents(token, calendarId, now, soon);

        for (const event of events) {
          if (!this.createdNotes.has(event.id)) {
            await this.createMeetingNote(event);
            this.createdNotes.add(event.id);
          }
        }
      }
    } catch {
      // Silently skip if not authenticated or API error
    }
  }

  private async fetchEvents(
    token: string,
    calendarId: string,
    timeMin: Date,
    timeMax: Date
  ): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
    });

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) throw new Error(`Calendar API error: ${res.status}`);
    const data = await res.json();
    return data.items ?? [];
  }

  // --- Note Creation ---

  private async createMeetingNote(event: CalendarEvent) {
    const settings = await this.host.settings.get<{
      folder: string;
      autoTag: boolean;
    }>("settings");

    const folder = settings?.folder ?? "Meetings";
    const folders = await this.host.notes.listFolders();
    let folderId = folders.find((f) => f.name === folder)?.id;
    if (!folderId) {
      const created = await this.host.notes.createFolder(folder);
      folderId = created.id;
    }

    const startTime = new Date(event.start.dateTime);
    const endTime = new Date(event.end.dateTime);
    const attendees = event.attendees
      ?.filter((a) => !a.email.includes("resource.calendar"))
      ?.map((a) => a.displayName || a.email) ?? [];

    const content = this.buildNoteContent(event, startTime, endTime, attendees);

    const tags = ["meeting"];
    if (settings?.autoTag && attendees.length > 0) {
      tags.push(...attendees.slice(0, 5).map((a) => a.split(" ")[0].toLowerCase()));
    }

    const note = await this.host.notes.createNote({
      title: event.summary || "Untitled Meeting",
      content,
      folderId,
      tags,
    });

    this.host.workspace.openNote(note.id);
  }

  private buildNoteContent(
    event: CalendarEvent,
    start: Date,
    end: Date,
    attendees: string[]
  ): string {
    const lines: string[] = [
      `# ${event.summary || "Meeting"}`,
      "",
      `**Date:** ${start.toLocaleDateString()}`,
      `**Time:** ${start.toLocaleTimeString()} — ${end.toLocaleTimeString()}`,
    ];

    if (attendees.length > 0) {
      lines.push(`**Attendees:** ${attendees.join(", ")}`);
    }
    if (event.location) {
      lines.push(`**Location:** ${event.location}`);
    }
    if (event.hangoutLink) {
      lines.push(`**Meeting Link:** ${event.hangoutLink}`);
    }
    if (event.description) {
      lines.push("", `**Description:**`, event.description);
    }

    lines.push(
      "",
      "## Agenda",
      "",
      "",
      "## Notes",
      "",
      "",
      "## Action Items",
      "",
      "- [ ] ",
      "",
      "## Follow Up",
      "",
    );

    return lines.join("\n");
  }

  private async createForNextEvent() {
    const token = await this.getAccessToken();
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const events = await this.fetchEvents(token, "primary", now, endOfDay);
    if (events.length > 0) {
      await this.createMeetingNote(events[0]);
      this.createdNotes.add(events[0].id);
    }
  }

  private async createForToday() {
    const token = await this.getAccessToken();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const events = await this.fetchEvents(token, "primary", startOfDay, endOfDay);
    for (const event of events) {
      if (!this.createdNotes.has(event.id)) {
        await this.createMeetingNote(event);
        this.createdNotes.add(event.id);
      }
    }
  }

  private buildOAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: "GOOGLE_CLIENT_ID",
      redirect_uri: "http://localhost:3005/auth/google/callback",
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar.readonly",
      access_type: "offline",
      prompt: "consent",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  private async refreshAccessToken(refreshToken: string) {
    // Exchange refresh token for new access token
    return { accessToken: "", refreshToken, expiresAt: Date.now() + 3600000 };
  }
}
```

## What This Example Demonstrates

| API Feature | Usage |
|---|---|
| `host.commands.register()` | Connect, create for next, create for today |
| `host.settings.getEncrypted()` | Securely store OAuth tokens |
| `host.settings.setEncrypted()` | Persist encrypted credentials |
| `host.notes.createNote()` | Auto-create meeting notes |
| `host.notes.createFolder()` | Ensure meetings folder exists |
| `host.notes.listFolders()` | Find existing folder |
| `host.workspace.openNote()` | Navigate to created note |
| `host.workspace.openExternalUrl()` | Open OAuth consent page |
| Background polling | `setInterval` for upcoming event detection |
| `deactivate()` cleanup | Persist state, clear timer |

## E2E Encryption Compatibility

- `requiresPlaintext: false` — creates notes via NotesAPI, encryption handled transparently
- OAuth tokens stored via `getEncrypted`/`setEncrypted` — encrypted with user's key
- Works in all encryption tiers

## Tasks

- [ ] Create `packages/ns-plugin-google-calendar/`
- [ ] Implement Google Calendar OAuth 2.0 flow
- [ ] Event polling with configurable check interval
- [ ] Meeting note template with event metadata
- [ ] Auto-tag with attendee names
- [ ] Commands: connect, create for next, create for today
- [ ] Deduplication via event ID tracking
- [ ] Settings UI: calendar picker, minutes before, folder, template, auto-tag
- [ ] Tests: note content generation, event parsing, deduplication
