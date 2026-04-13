# 26 — Example Plugin: Reminders

**Status:** Planned
**Phase:** Example Plugins
**Priority:** Medium
**Plugin Type:** `full` (command + AI tool + notifications)
**Depends On:** [02a — Scheduler API](02a-scheduler-api.md)

## Summary

Set reminders from the AI Assistant via slash command (`/setreminder`) or natural language ("Remind me to review the PR at 3pm"). Reminders trigger platform-native notifications at the scheduled time with optional deep links to specific notes. Demonstrates the Scheduler API, AI tool registration, slash command registration, and persistent plugin storage.

## Manifest

```json
{
  "id": "notesync-reminders",
  "name": "Reminders",
  "version": "1.0.0",
  "description": "Set reminders via AI or slash commands with native notifications",
  "author": "NoteSync",
  "hostApiVersion": "^1.0.0",
  "type": "full",
  "requiresPlaintext": false,
  "platforms": ["web", "desktop", "mobile"],
  "settings": {
    "schema": {
      "defaultLeadTime": { "type": "number", "description": "Default reminder minutes before (for calendar-style reminders)" },
      "soundEnabled": { "type": "boolean", "description": "Play sound on notification" }
    },
    "defaults": {
      "defaultLeadTime": 5,
      "soundEnabled": true
    }
  }
}
```

## User Experience

### Via Slash Command

```
/setreminder 3pm Review the PR
/setreminder tomorrow 9am Submit expense report
/setreminder in 30 minutes Check build status
/setreminder friday 2pm Team sync prep
```

Response in chat: "Reminder set for 3:00 PM: Review the PR"

### Via Natural Language (AI Tool)

```
"Remind me to review the PR at 3pm"
"Set a reminder for tomorrow morning to follow up with Sarah"
"Remind me in 20 minutes to check the deployment"
```

Claude parses the time and message, calls the `set_reminder` tool, confirms in chat.

### When Reminder Fires

- Platform notification appears (macOS/Windows notification center, browser notification, mobile push)
- Notification title: "Reminder"
- Notification body: "Review the PR"
- Click notification → opens NoteSync (and optionally navigates to a linked note)

### Managing Reminders

```
/reminders                    — List active reminders
/cancelreminder <id>          — Cancel a specific reminder
"Show me my reminders"        — AI lists active reminders
"Cancel my 3pm reminder"      — AI finds and cancels it
```

## Plugin Implementation

```typescript
import type { Plugin, NoteSync } from "@notesync/plugin-api";

interface Reminder {
  id: string;
  message: string;
  scheduledAt: string; // ISO date
  noteId?: string;
  createdAt: string;
}

export default class RemindersPlugin implements Plugin {
  manifest = require("./manifest.json");
  private host!: NoteSync;

  register(host: NoteSync) {
    this.host = host;

    // Slash command: /setreminder
    host.commands.registerSlashCommand({
      name: "setreminder",
      description: "Set a reminder — /setreminder 3pm Review the PR",
      execute: async (args) => {
        const parsed = parseReminderInput(args);
        if (!parsed) return { text: "Could not parse time. Try: /setreminder 3pm Review the PR" };
        return this.createReminder(parsed.time, parsed.message);
      },
    });

    // Slash command: /reminders
    host.commands.registerSlashCommand({
      name: "reminders",
      description: "List active reminders",
      execute: async () => {
        const reminders = await this.getActiveReminders();
        if (reminders.length === 0) return { text: "No active reminders." };
        const list = reminders.map((r) =>
          `- **${new Date(r.scheduledAt).toLocaleString()}**: ${r.message} (id: ${r.id.slice(0, 8)})`
        ).join("\n");
        return { text: `**Active Reminders:**\n${list}` };
      },
    });

    // Slash command: /cancelreminder
    host.commands.registerSlashCommand({
      name: "cancelreminder",
      description: "Cancel a reminder — /cancelreminder <id>",
      execute: async (args) => {
        const id = args.trim();
        const reminders = await this.getActiveReminders();
        const match = reminders.find((r) => r.id.startsWith(id));
        if (!match) return { text: `No reminder found matching "${id}"` };
        host.scheduler.cancel(match.id);
        await this.removeReminder(match.id);
        return { text: `Cancelled reminder: ${match.message}` };
      },
    });

    // AI tool: set_reminder
    host.providers.registerTool({
      definition: {
        name: "set_reminder",
        description: "Set a reminder for the user at a specific time. Use this when the user asks to be reminded of something.",
        input_schema: {
          type: "object",
          properties: {
            time: {
              type: "string",
              description: "When to remind. Natural language like '3pm', 'tomorrow 9am', 'in 30 minutes', 'friday 2pm'.",
            },
            message: {
              type: "string",
              description: "What to remind the user about.",
            },
            noteId: {
              type: "string",
              description: "Optional note ID to link the reminder to. Include if the reminder is about a specific note.",
            },
          },
          required: ["time", "message"],
        },
      },
      describe: (input) => `Setting reminder: ${(input as { message: string }).message}`,
      execute: async (input) => {
        const { time, message, noteId } = input as { time: string; message: string; noteId?: string };
        const parsedTime = parseTimeString(time);
        if (!parsedTime) return { text: `Could not parse time: "${time}"`, noteCards: [] };
        const result = await this.createReminder(parsedTime, message, noteId);
        return { text: result.text, noteCards: [] };
      },
    });

    // AI tool: list_reminders
    host.providers.registerTool({
      definition: {
        name: "list_reminders",
        description: "List the user's active reminders.",
        input_schema: { type: "object", properties: {} },
      },
      describe: () => "Listing active reminders",
      execute: async () => {
        const reminders = await this.getActiveReminders();
        if (reminders.length === 0) return { text: "No active reminders.", noteCards: [] };
        const list = reminders.map((r) =>
          `- ${new Date(r.scheduledAt).toLocaleString()}: ${r.message}`
        ).join("\n");
        return { text: `Active reminders:\n${list}`, noteCards: [] };
      },
    });

    // AI tool: cancel_reminder
    host.providers.registerTool({
      definition: {
        name: "cancel_reminder",
        description: "Cancel a specific reminder by matching the message text.",
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Part of the reminder message to match" },
          },
          required: ["query"],
        },
      },
      describe: (input) => `Cancelling reminder: ${(input as { query: string }).query}`,
      execute: async (input) => {
        const { query } = input as { query: string };
        const reminders = await this.getActiveReminders();
        const match = reminders.find((r) =>
          r.message.toLowerCase().includes(query.toLowerCase())
        );
        if (!match) return { text: `No reminder found matching "${query}"`, noteCards: [] };
        this.host.scheduler.cancel(match.id);
        await this.removeReminder(match.id);
        return { text: `Cancelled: ${match.message}`, noteCards: [] };
      },
    });
  }

  async activate(host: NoteSync) {
    // Re-register persistent reminders that haven't fired yet
    const reminders = await this.getActiveReminders();
    for (const r of reminders) {
      const scheduledAt = new Date(r.scheduledAt);
      if (scheduledAt > new Date()) {
        host.scheduler.scheduleNotification(r.id, scheduledAt, {
          title: "Reminder",
          body: r.message,
          noteId: r.noteId,
        });
      } else {
        // Overdue — fire immediately
        host.scheduler.scheduleNotification(r.id, new Date(), {
          title: "Reminder (overdue)",
          body: r.message,
          noteId: r.noteId,
        });
        await this.removeReminder(r.id);
      }
    }
  }

  async deactivate() {}

  // --- Helpers ---

  private async createReminder(time: Date, message: string, noteId?: string) {
    const id = `reminder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const reminder: Reminder = {
      id,
      message,
      scheduledAt: time.toISOString(),
      noteId,
      createdAt: new Date().toISOString(),
    };

    // Persist
    const reminders = await this.getActiveReminders();
    reminders.push(reminder);
    await this.host.settings.set("reminders", reminders);

    // Schedule notification
    this.host.scheduler.scheduleNotification(id, time, {
      title: "Reminder",
      body: message,
      noteId,
    });

    return { text: `Reminder set for ${time.toLocaleString()}: ${message}` };
  }

  private async getActiveReminders(): Promise<Reminder[]> {
    return (await this.host.settings.get<Reminder[]>("reminders")) ?? [];
  }

  private async removeReminder(id: string) {
    const reminders = await this.getActiveReminders();
    await this.host.settings.set("reminders", reminders.filter((r) => r.id !== id));
  }
}

// --- Time parsing utilities ---

function parseReminderInput(input: string): { time: Date; message: string } | null {
  // Match patterns like "3pm Review PR", "tomorrow 9am Submit report", "in 30 minutes Check build"
  const inMatch = input.match(/^in\s+(\d+)\s+(minutes?|hours?|days?)\s+(.+)$/i);
  if (inMatch) {
    const amount = parseInt(inMatch[1]);
    const unit = inMatch[2].toLowerCase();
    const message = inMatch[3];
    const now = new Date();
    if (unit.startsWith("minute")) now.setMinutes(now.getMinutes() + amount);
    else if (unit.startsWith("hour")) now.setHours(now.getHours() + amount);
    else if (unit.startsWith("day")) now.setDate(now.getDate() + amount);
    return { time: now, message };
  }

  // Match "3pm message" or "3:30pm message"
  const timeMatch = input.match(/^(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+(.+)$/i);
  if (timeMatch) {
    const time = parseTimeString(timeMatch[1]);
    if (time) return { time, message: timeMatch[2] };
  }

  // Match "tomorrow 9am message"
  const tomorrowMatch = input.match(/^tomorrow\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+(.+)$/i);
  if (tomorrowMatch) {
    const time = parseTimeString(tomorrowMatch[1]);
    if (time) {
      time.setDate(time.getDate() + 1);
      return { time, message: tomorrowMatch[2] };
    }
  }

  return null;
}

function parseTimeString(timeStr: string): Date | null {
  // Parse "3pm", "3:30pm", "15:00", etc.
  const match = timeStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hours = parseInt(match[1]);
  const minutes = match[2] ? parseInt(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase();

  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  // If the time has already passed today, schedule for tomorrow
  if (date <= new Date()) {
    date.setDate(date.getDate() + 1);
  }

  return date;
}
```

## What This Example Demonstrates

| API Feature | Usage |
|---|---|
| `host.scheduler.scheduleNotification()` | Schedule platform-native notifications at specific times |
| `host.providers.registerTool()` | Three AI tools: set, list, cancel reminders |
| `host.commands.registerSlashCommand()` | Three slash commands: /setreminder, /reminders, /cancelreminder |
| `host.settings.get/set()` | Persist reminders across sessions |
| Plugin `activate()` | Re-register persistent reminders on startup, fire overdue ones |

## Interaction Examples

**Slash commands:**
```
User: /setreminder 3pm Review the PR
Bot:  Reminder set for 3:00 PM: Review the PR

User: /reminders
Bot:  **Active Reminders:**
      - 3:00 PM: Review the PR (id: reminder-)
      
User: /cancelreminder reminder-
Bot:  Cancelled reminder: Review the PR
```

**Natural language (Claude uses tools):**
```
User: Remind me to follow up with Sarah tomorrow at 9am
Bot:  [Setting reminder: follow up with Sarah]
      Reminder set for tomorrow at 9:00 AM: follow up with Sarah

User: What reminders do I have?
Bot:  [Listing active reminders]
      You have 2 active reminders:
      - Today 3:00 PM: Review the PR
      - Tomorrow 9:00 AM: Follow up with Sarah

User: Cancel the PR reminder
Bot:  [Cancelling reminder: PR]
      Done — cancelled "Review the PR"
```

**During a meeting:**
```
User: Remind me to send the meeting notes to the team in 30 minutes
Bot:  [Setting reminder: send meeting notes to the team]
      Reminder set for 2:30 PM: send the meeting notes to the team
```

## E2E Encryption Compatibility

- `requiresPlaintext: false` — reminders are stored as plugin data, not note content
- Reminder text is stored in plugin settings (could use `getEncrypted`/`setEncrypted` for sensitive reminders)
- Works in all encryption tiers

## Tasks

- [ ] Create `packages/ns-plugin-reminders/`
- [ ] Implement time parsing utilities (relative: "in 30 minutes", absolute: "3pm", "tomorrow 9am")
- [ ] Register slash commands: /setreminder, /reminders, /cancelreminder
- [ ] Register AI tools: set_reminder, list_reminders, cancel_reminder
- [ ] Persistent reminder storage via plugin settings
- [ ] Re-register reminders on activate (startup), fire overdue
- [ ] Integration with Scheduler API for notifications
- [ ] Tests: time parsing, reminder CRUD, overdue handling
