# 27 — Example Plugin: Microsoft Calendar

**Status:** Planned
**Phase:** Example Plugins
**Priority:** Medium
**Plugin Type:** `integration`

## Summary

Connects NoteSync to Microsoft 365 / Outlook Calendar via the Microsoft Graph API. Auto-creates meeting notes, prompts to start recording before meetings, and surfaces related notes based on meeting context. Mirrors the Google Calendar plugin but uses Microsoft's authentication and API surface.

## Manifest

```json
{
  "id": "notesync-microsoft-calendar",
  "name": "Microsoft Calendar",
  "version": "1.0.0",
  "description": "Auto-create meeting notes and detect meetings from Microsoft 365 / Outlook Calendar",
  "author": "NoteSync",
  "hostApiVersion": "^1.0.0",
  "type": "integration",
  "requiresPlaintext": false,
  "platforms": ["web", "desktop"],
  "settings": {
    "schema": {
      "minutesBefore": { "type": "number", "description": "Create note X minutes before event" },
      "folder": { "type": "string", "description": "Folder for meeting notes" },
      "autoTag": { "type": "boolean", "description": "Auto-tag with attendee names" },
      "promptRecording": { "type": "boolean", "description": "Prompt to start recording before meetings" },
      "autoRecordMode": { "type": "string", "enum": ["meeting", "lecture", "memo", "verbatim", "off"], "description": "Auto-start recording mode" },
      "surfaceRelatedNotes": { "type": "boolean", "description": "Show related notes before meeting starts" }
    },
    "defaults": {
      "minutesBefore": 5,
      "folder": "Meetings",
      "autoTag": true,
      "promptRecording": true,
      "autoRecordMode": "off",
      "surfaceRelatedNotes": true
    }
  }
}
```

## Key Differences from Google Calendar Plugin

| Aspect | Google Calendar | Microsoft Calendar |
|--------|----------------|-------------------|
| Auth | Google OAuth 2.0 | Microsoft MSAL / OAuth 2.0 |
| API | Google Calendar REST API | Microsoft Graph API |
| Endpoint | `googleapis.com/calendar/v3` | `graph.microsoft.com/v1.0` |
| Scopes | `calendar.readonly` | `Calendars.Read` |
| Meeting links | `hangoutLink` | `onlineMeeting.joinUrl` |
| Attendees | `attendees[].email` | `attendees[].emailAddress.address` |
| Recurring events | `singleEvents=true` param | `$expand=instances` or calendar view |

## Plugin Implementation

```typescript
import type { Plugin, NoteSync } from "@notesync/plugin-api";

interface GraphEvent {
  id: string;
  subject: string;
  bodyPreview?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees?: { emailAddress: { name: string; address: string } }[];
  onlineMeeting?: { joinUrl: string };
  location?: { displayName: string };
  isOnlineMeeting: boolean;
}

export default class MicrosoftCalendarPlugin implements Plugin {
  manifest = require("./manifest.json");
  private host!: NoteSync;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private createdNotes: Set<string> = new Set();

  register(host: NoteSync) {
    this.host = host;

    host.commands.register({
      id: "mscal:create-for-next",
      name: "Create Note for Next Meeting",
      callback: () => this.createForNextEvent(),
    });

    host.commands.register({
      id: "mscal:connect",
      name: "Connect Microsoft Calendar",
      callback: () => this.authenticate(),
    });
  }

  async activate(host: NoteSync) {
    const tracked = await host.settings.get<string[]>("createdEventIds");
    if (tracked) tracked.forEach((id) => this.createdNotes.add(id));

    this.pollTimer = setInterval(() => this.checkUpcomingEvents(), 60 * 1000);
    await this.checkUpcomingEvents();
  }

  async deactivate() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    await this.host.settings.set("createdEventIds", [...this.createdNotes]);
  }

  // --- Authentication (MSAL) ---

  private async authenticate() {
    // Microsoft OAuth 2.0 with PKCE flow
    // Uses MSAL.js or manual authorization code flow
    const authUrl = this.buildAuthUrl();
    this.host.workspace.openExternalUrl(authUrl);
  }

  private async getAccessToken(): Promise<string> {
    const tokens = await this.host.settings.getEncrypted<{
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
    }>("oauth_tokens");

    if (!tokens) throw new Error("Not authenticated. Run 'Connect Microsoft Calendar' first.");

    if (Date.now() > tokens.expiresAt) {
      const refreshed = await this.refreshAccessToken(tokens.refreshToken);
      await this.host.settings.setEncrypted("oauth_tokens", refreshed);
      return refreshed.accessToken;
    }

    return tokens.accessToken;
  }

  // --- Event Polling via Microsoft Graph ---

  private async checkUpcomingEvents() {
    try {
      const token = await this.getAccessToken();
      const settings = await this.host.settings.get<{
        minutesBefore: number;
        promptRecording: boolean;
        autoRecordMode: string;
        surfaceRelatedNotes: boolean;
      }>("settings");

      const minutesBefore = settings?.minutesBefore ?? 5;
      const now = new Date();
      const soon = new Date(now.getTime() + minutesBefore * 60 * 1000);

      const events = await this.fetchCalendarView(token, now, soon);

      for (const event of events) {
        if (!this.createdNotes.has(event.id)) {
          await this.createMeetingNote(event);
          this.createdNotes.add(event.id);

          // Surface related notes
          if (settings?.surfaceRelatedNotes) {
            const related = await this.host.notes.search(event.subject, "semantic");
            if (related.length > 0) {
              this.host.notifications.show({
                title: `Related notes for "${event.subject}"`,
                body: related.slice(0, 3).map((r) => r.title).join(", "),
                duration: 10000,
                action: { label: "View", callback: () => this.host.workspace.openNote(related[0].id) },
              });
            }
          }

          // Prompt or auto-start recording
          if (settings?.promptRecording && !this.host.recording.isRecording) {
            const recordMode = settings?.autoRecordMode;
            if (recordMode && recordMode !== "off") {
              await this.host.recording.start(recordMode as "meeting" | "lecture" | "memo" | "verbatim");
            } else {
              this.host.notifications.show({
                title: `"${event.subject}" starting soon`,
                body: event.isOnlineMeeting ? "Teams meeting detected" : "Meeting starting",
                duration: 0,
                action: { label: "Start Recording", callback: () => this.host.recording.start("meeting") },
                secondaryAction: { label: "Dismiss", callback: () => {} },
              });
            }
          }
        }
      }
    } catch {
      // Silently skip
    }
  }

  private async fetchCalendarView(token: string, start: Date, end: Date): Promise<GraphEvent[]> {
    const params = new URLSearchParams({
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString(),
      $select: "id,subject,bodyPreview,start,end,attendees,onlineMeeting,location,isOnlineMeeting",
      $orderby: "start/dateTime",
    });

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarView?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) throw new Error(`Graph API error: ${res.status}`);
    const data = await res.json();
    return data.value ?? [];
  }

  // --- Note Creation ---

  private async createMeetingNote(event: GraphEvent) {
    const settings = await this.host.settings.get<{ folder: string; autoTag: boolean }>("settings");
    const folder = settings?.folder ?? "Meetings";

    const folders = await this.host.notes.listFolders();
    let folderId = folders.find((f) => f.name === folder)?.id;
    if (!folderId) {
      const created = await this.host.notes.createFolder(folder);
      folderId = created.id;
    }

    const attendees = event.attendees?.map((a) => a.emailAddress.name || a.emailAddress.address) ?? [];
    const start = new Date(event.start.dateTime);
    const end = new Date(event.end.dateTime);

    const lines = [
      `# ${event.subject || "Meeting"}`,
      "",
      `**Date:** ${start.toLocaleDateString()}`,
      `**Time:** ${start.toLocaleTimeString()} — ${end.toLocaleTimeString()}`,
    ];

    if (attendees.length > 0) lines.push(`**Attendees:** ${attendees.join(", ")}`);
    if (event.location?.displayName) lines.push(`**Location:** ${event.location.displayName}`);
    if (event.onlineMeeting?.joinUrl) lines.push(`**Teams Link:** ${event.onlineMeeting.joinUrl}`);
    if (event.bodyPreview) lines.push("", `**Description:**`, event.bodyPreview);

    lines.push("", "## Agenda", "", "", "## Notes", "", "", "## Action Items", "", "- [ ] ", "", "## Follow Up", "");

    const tags = ["meeting"];
    if (settings?.autoTag && attendees.length > 0) {
      tags.push(...attendees.slice(0, 5).map((a) => a.split(" ")[0].toLowerCase()));
    }

    const note = await this.host.notes.createNote({
      title: event.subject || "Untitled Meeting",
      content: lines.join("\n"),
      folderId,
      tags,
    });

    this.host.workspace.openNote(note.id);
  }

  private async createForNextEvent() {
    const token = await this.getAccessToken();
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    const events = await this.fetchCalendarView(token, now, endOfDay);
    if (events.length > 0) {
      await this.createMeetingNote(events[0]);
      this.createdNotes.add(events[0].id);
    }
  }

  private buildAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: "MS_CLIENT_ID",
      redirect_uri: "http://localhost:3005/auth/microsoft/callback",
      response_type: "code",
      scope: "Calendars.Read offline_access",
      response_mode: "query",
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
  }

  private async refreshAccessToken(refreshToken: string) {
    return { accessToken: "", refreshToken, expiresAt: Date.now() + 3600000 };
  }
}
```

## What This Example Demonstrates

| API Feature | Usage |
|---|---|
| `host.commands.register()` | Connect, create for next meeting |
| `host.settings.getEncrypted()` | Securely store Microsoft OAuth tokens |
| `host.notes.createNote()` | Auto-create meeting notes with Teams metadata |
| `host.notes.search()` | Surface related notes by meeting subject |
| `host.recording.start()` | Auto-start or prompt-start meeting recording |
| `host.recording.isRecording` | Check recording state before prompting |
| `host.notifications.show()` | Meeting prompts with Start Recording / Dismiss actions |
| `host.workspace.openNote()` | Navigate to created note |
| `host.workspace.openExternalUrl()` | Open Microsoft OAuth consent page |
| Microsoft Graph API | Calendar view, event metadata, Teams meeting detection |

## E2E Encryption Compatibility

- `requiresPlaintext: false` — creates notes via NotesAPI, encryption handled transparently
- OAuth tokens stored via `getEncrypted`/`setEncrypted`
- Works in all encryption tiers

## Tasks

- [ ] Create `packages/ns-plugin-microsoft-calendar/`
- [ ] Implement Microsoft OAuth 2.0 with PKCE
- [ ] Microsoft Graph calendar view polling
- [ ] Meeting note template with Teams/Outlook metadata
- [ ] Teams meeting link detection (`isOnlineMeeting`)
- [ ] Recording prompt with `host.recording` and `host.notifications`
- [ ] Related notes surfacing via semantic search
- [ ] Commands: connect, create for next meeting
- [ ] Settings UI: minutes before, folder, auto-tag, recording mode
- [ ] Tests: Graph API response parsing, note content generation
