# 22 — Example Plugin: Git Backup

**Status:** Planned
**Phase:** Example Plugins
**Priority:** Medium
**Plugin Type:** `sync-handler`

## Summary

Auto-commit notes to a private Git repository on every save. Each note is a markdown file in the repo, organized by folder. Provides full version history via Git, works with GitHub/GitLab/self-hosted repos, and runs headless without the app open. Demonstrates event hooks, sync-handler plugin type, and the API-first architecture.

## Manifest

```json
{
  "id": "notesync-git-backup",
  "name": "Git Backup",
  "version": "1.0.0",
  "description": "Auto-commit notes to a Git repository for backup and version history",
  "author": "NoteSync",
  "hostApiVersion": "^1.0.0",
  "type": "sync-handler",
  "requiresPlaintext": true,
  "platforms": ["desktop", "cli"],
  "settings": {
    "schema": {
      "repoPath": { "type": "string", "description": "Local path to Git repository" },
      "remoteName": { "type": "string", "description": "Git remote name" },
      "branch": { "type": "string", "description": "Branch to commit to" },
      "autoPush": { "type": "boolean", "description": "Auto-push after each commit" },
      "commitOnSave": { "type": "boolean", "description": "Commit on every note save" },
      "commitInterval": { "type": "number", "description": "Batch commit interval in minutes (0 = every save)" }
    },
    "defaults": {
      "repoPath": "",
      "remoteName": "origin",
      "branch": "main",
      "autoPush": true,
      "commitOnSave": false,
      "commitInterval": 5
    }
  }
}
```

## Plugin Implementation

```typescript
import type { Plugin, NoteSync, Note } from "@notesync/plugin-api";
import { execSync } from "child_process";
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { join } from "path";

export default class GitBackupPlugin implements Plugin {
  manifest = require("./manifest.json");
  private host!: NoteSync;
  private pendingChanges: Map<string, Note> = new Map();
  private pendingDeletes: Set<string> = new Set();
  private timer: ReturnType<typeof setInterval> | null = null;

  register(host: NoteSync) {
    this.host = host;

    // Listen for note changes
    host.events.on("note:created", (note) => this.queueChange(note));
    host.events.on("note:updated", (note) => this.queueChange(note));
    host.events.on("note:deleted", (noteId) => this.queueDelete(noteId));

    // Commands
    host.commands.register({
      id: "git-backup:sync-now",
      name: "Git Backup: Sync Now",
      callback: () => this.commitAndPush(),
    });

    host.commands.register({
      id: "git-backup:status",
      name: "Git Backup: Show Status",
      callback: () => this.showStatus(),
    });
  }

  async activate(host: NoteSync) {
    const settings = await host.settings.get<{
      commitInterval: number;
      commitOnSave: boolean;
    }>("settings");

    // Start batch commit timer
    const interval = settings?.commitInterval ?? 5;
    if (interval > 0 && !settings?.commitOnSave) {
      this.timer = setInterval(() => this.commitAndPush(), interval * 60 * 1000);
    }
  }

  async deactivate() {
    if (this.timer) clearInterval(this.timer);
    // Flush pending changes
    if (this.pendingChanges.size > 0 || this.pendingDeletes.size > 0) {
      await this.commitAndPush();
    }
  }

  private async queueChange(note: Note) {
    this.pendingChanges.set(note.id, note);

    const settings = await this.host.settings.get<{ commitOnSave: boolean }>("settings");
    if (settings?.commitOnSave) {
      await this.commitAndPush();
    }
  }

  private queueDelete(noteId: string) {
    this.pendingChanges.delete(noteId);
    this.pendingDeletes.add(noteId);
  }

  private async commitAndPush() {
    if (this.pendingChanges.size === 0 && this.pendingDeletes.size === 0) return;

    const settings = await this.host.settings.get<{
      repoPath: string;
      remoteName: string;
      branch: string;
      autoPush: boolean;
    }>("settings");

    const repoPath = settings?.repoPath;
    if (!repoPath) return;

    try {
      // Write changed notes as markdown files
      for (const [, note] of this.pendingChanges) {
        const folderPath = note.folderName ? join(repoPath, note.folderName) : repoPath;
        if (!existsSync(folderPath)) mkdirSync(folderPath, { recursive: true });

        const filename = this.sanitizeFilename(note.title) + ".md";
        const filePath = join(folderPath, filename);

        // Frontmatter + content
        const frontmatter = [
          "---",
          `title: "${note.title}"`,
          `id: ${note.id}`,
          note.tags?.length ? `tags: [${note.tags.join(", ")}]` : null,
          `updated: ${note.updatedAt}`,
          "---",
        ].filter(Boolean).join("\n");

        writeFileSync(filePath, `${frontmatter}\n\n${note.content}`);
      }

      // Remove deleted notes
      for (const noteId of this.pendingDeletes) {
        // Find and remove the file (would need a mapping of noteId → filePath)
      }

      // Git operations
      const git = (cmd: string) => execSync(`git ${cmd}`, { cwd: repoPath, encoding: "utf-8" });

      git("add -A");

      const changeCount = this.pendingChanges.size + this.pendingDeletes.size;
      const message = `NoteSync backup: ${changeCount} change${changeCount !== 1 ? "s" : ""}`;
      git(`commit -m "${message}"`);

      if (settings?.autoPush) {
        const remote = settings.remoteName ?? "origin";
        const branch = settings.branch ?? "main";
        git(`push ${remote} ${branch}`);
      }

      // Clear pending
      this.pendingChanges.clear();
      this.pendingDeletes.clear();
    } catch (e) {
      console.error("[GitBackup] Failed:", e);
    }
  }

  private async showStatus() {
    const settings = await this.host.settings.get<{ repoPath: string }>("settings");
    if (!settings?.repoPath) return;

    const status = execSync("git status --short", {
      cwd: settings.repoPath,
      encoding: "utf-8",
    });

    const log = execSync("git log --oneline -5", {
      cwd: settings.repoPath,
      encoding: "utf-8",
    });

    // Display in a notification or panel
    console.log("Git Status:\n", status);
    console.log("Recent commits:\n", log);
  }

  private sanitizeFilename(title: string): string {
    return title.replace(/[/\\?%*:|"<>]/g, "-").trim();
  }
}
```

## Repo Structure

```
notes-backup/
  Work/
    Project Plan.md
    Sprint Review.md
  Personal/
    Reading List.md
    Journal/
      2026-04-11.md
  Inbox.md
```

Each note is a markdown file with YAML frontmatter containing the NoteSync ID, tags, and timestamp.

## CLI Usage

```bash
# Manual sync
ns git-backup sync

# Check status
ns git-backup status

# Run as a cron job for automated backups
*/5 * * * * cd ~/notes-backup && ns git-backup sync
```

## What This Example Demonstrates

| API Feature | Usage |
|---|---|
| `host.events.on("note:created/updated/deleted", ...)` | React to note lifecycle events |
| `host.commands.register()` | Manual sync and status commands |
| `host.settings.get()` | Repo path, remote, branch, auto-push config |
| Batch processing | Queue changes, commit on interval |
| `deactivate()` cleanup | Flush pending changes on plugin shutdown |
| Headless operation | Works via CLI cron job without the app open |

## E2E Encryption Compatibility

- `requiresPlaintext: true` — needs to write decrypted note content as markdown files
- Desktop only: runs on the user's machine where notes are decrypted locally
- The Git repo contains plaintext — user should ensure the repo is private
- Not available on web (no filesystem access) or when server can't access plaintext

## Tasks

- [ ] Create `packages/ns-plugin-git-backup/`
- [ ] Implement note → markdown file writer with frontmatter
- [ ] Change queue with batch commit support
- [ ] Git operations: add, commit, push
- [ ] Commit interval timer with flush on deactivate
- [ ] CLI commands: sync, status
- [ ] Settings UI: repo path (with directory picker), remote, branch, auto-push toggle
- [ ] Tests: filename sanitization, frontmatter generation, change queuing
